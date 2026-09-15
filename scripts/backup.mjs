#!/usr/bin/env node
/**
 * Pre-migration safety net: dump the whole PostgreSQL database to a gzipped, timestamped file
 * before any schema change runs. If a migration (or its backfill) eats data, you restore the dump
 * with `npm run db:restore` and you're back where you started.
 *
 * Reads the same connection details the Prisma commands use, so there's no second place to keep
 * credentials. The password is handed to pg_dump through a temp PGPASSFILE (mode 0600), never on
 * the command line, so it can't leak via `ps`.
 *
 * Usage (from the project root):
 *   npm run db:backup                    # dump to scripts/../backups
 *   node scripts/backup.mjs --env .env   # use a different env file
 *
 * Requires the PostgreSQL client tools (pg_dump) to be installed and on PATH.
 */

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';
import { buildDatabaseUrl, parseDatabaseUrl } from './database-url.mjs';

const LOG_PREFIX = '[backup]';

/** Keep this many most-recent dumps; older ones are pruned after each run. */
const KEEP = 20;

const args = process.argv.slice(2);
const envPath = readFlag('--env') ?? '.env';

const here = dirname(fileURLToPath(import.meta.url));
// Defaults to <project>/backups; set FLOKIE_BACKUP_DIR (absolute) on the server to keep dumps on a
// disk that survives a redeploy of the working tree.
const backupDir = process.env.FLOKIE_BACKUP_DIR || join(here, '..', 'backups');

function readFlag(name) {
	const index = args.indexOf(name);
	return index !== -1 && args[index + 1] ? args[index + 1] : null;
}

/** A compact, sortable UTC stamp: 20260915-143005. */
function stamp() {
	const date = new Date();
	const pad = (value) => String(value).padStart(2, '0');
	return (
		`${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
		`-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
	);
}

async function pruneOld() {
	const files = (await readdir(backupDir)).filter((file) => /^flokie-.*\.sql\.gz$/.test(file)).sort(); // timestamp prefix sorts chronologically

	const stale = files.slice(0, Math.max(0, files.length - KEEP));
	for (const file of stale) await rm(join(backupDir, file), { force: true });
	if (stale.length) console.log(`${LOG_PREFIX} pruned ${stale.length} old dump(s)`);
}

async function main() {
	const db = parseDatabaseUrl(buildDatabaseUrl(envPath), LOG_PREFIX);

	await mkdir(backupDir, { recursive: true });
	const outPath = join(backupDir, `flokie-${stamp()}.sql.gz`);

	// libpq reads the password from a passfile, one `host:port:database:user:password` line. It
	// refuses files that are group/world readable, hence the explicit 0600.
	const passFilePath = join(tmpdir(), `flokie-dump-${randomBytes(6).toString('hex')}.pgpass`);
	await writeFile(passFilePath, `${db.host}:${db.port}:${db.database}:${db.user}:${db.password}\n`, {
		mode: 0o600,
	});

	const dumpArgs = [
		'--host',
		db.host,
		'--port',
		db.port,
		'--username',
		db.user,
		'--no-password', // never prompt: fail loudly instead of hanging on a TTY
		'--clean', // emit DROP statements so a restore replaces the current schema in place
		'--if-exists', // ...without erroring when restoring into an empty database
		'--no-owner', // keep the dump restorable under a different role, e.g. onto a fresh box
		'--no-acl',
		db.database,
	];

	console.log(`${LOG_PREFIX} dumping "${db.database}" → ${outPath}`);

	await new Promise((resolve, reject) => {
		const dump = spawn('pg_dump', dumpArgs, {
			stdio: ['ignore', 'pipe', 'inherit'],
			env: { ...process.env, PGPASSFILE: passFilePath },
		});
		const out = createWriteStream(outPath);
		let failed = false;

		dump.on('error', (error) => {
			failed = true;
			if (error.code === 'ENOENT') {
				reject(
					new Error(
						'pg_dump not found. Install the PostgreSQL client tools (e.g. `apt install postgresql-client`).',
					),
				);
			} else {
				reject(error);
			}
		});
		out.on('error', reject);

		dump.stdout.pipe(createGzip()).pipe(out);

		out.on('close', () => {
			if (failed) return;
			if (dump.exitCode === 0) resolve();
			else reject(new Error(`pg_dump exited with code ${dump.exitCode}`));
		});
	}).catch(async (error) => {
		await unlink(outPath).catch(() => {}); // drop the partial dump
		await unlink(passFilePath).catch(() => {});
		console.error(`${LOG_PREFIX} FAILED: ${error.message}`);
		process.exit(1);
	});

	await unlink(passFilePath).catch(() => {});
	await pruneOld();
	console.log(`${LOG_PREFIX} done.`);
}

await main();
