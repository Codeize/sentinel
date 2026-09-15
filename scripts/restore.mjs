#!/usr/bin/env node
/**
 * Roll back by restoring a dump made by backup.mjs. DESTRUCTIVE: it overwrites the current database
 * with the dump's contents. The dump carries DROP/CREATE per object (pg_dump --clean --if-exists),
 * including the _prisma_migrations table, so Prisma's migration history is rewound too.
 *
 * Because it can't be undone, it refuses to run without an explicit `--yes`.
 *
 *   npm run db:restore                              # lists available dumps
 *   npm run db:restore -- <file.sql.gz> --yes       # restores it
 *
 * Note: a table the failed migration *added* won't exist in an older dump, so it lingers after the
 * restore. For the data-loss case (columns/rows gone) that's harmless. For a clean rewind after an
 * additive migration, drop and recreate the database first, then restore.
 *
 * Requires the PostgreSQL client tools (psql) to be installed and on PATH.
 */

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, readdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { buildDatabaseUrl, parseDatabaseUrl } from './database-url.mjs';

const LOG_PREFIX = '[restore]';

const args = process.argv.slice(2);
const confirmed = args.includes('--yes');
const envPath = readFlag('--env') ?? '.env';
const requestedFile = args.find((arg) => !arg.startsWith('--') && arg !== envPath) ?? null;

const here = dirname(fileURLToPath(import.meta.url));
// Mirrors backup.mjs: honour FLOKIE_BACKUP_DIR so restore looks where dumps land.
const backupDir = process.env.FLOKIE_BACKUP_DIR || join(here, '..', 'backups');

function readFlag(name) {
	const index = args.indexOf(name);
	return index !== -1 && args[index + 1] ? args[index + 1] : null;
}

async function listDumps() {
	try {
		return (await readdir(backupDir)).filter((file) => /^flokie-.*\.sql\.gz$/.test(file)).sort();
	} catch {
		return [];
	}
}

async function main() {
	const dumps = await listDumps();

	if (!requestedFile) {
		if (!dumps.length) {
			console.error(`${LOG_PREFIX} No dumps found in ${backupDir}.`);
			process.exit(1);
		}

		console.log(`${LOG_PREFIX} Available dumps in ${backupDir} (newest last):`);
		for (const dump of dumps) console.log(`  ${dump}`);
		console.log(`\n${LOG_PREFIX} Re-run with a filename and --yes to restore, e.g.`);
		console.log(`  npm run db:restore -- ${dumps.at(-1)} --yes`);
		process.exit(0);
	}

	const dumpPath = isAbsolute(requestedFile) ? requestedFile : join(backupDir, requestedFile);

	try {
		await access(dumpPath);
	} catch {
		console.error(`${LOG_PREFIX} Dump not found: ${dumpPath}`);
		process.exit(1);
	}

	const db = parseDatabaseUrl(buildDatabaseUrl(envPath), LOG_PREFIX);

	if (!confirmed) {
		console.error(`${LOG_PREFIX} This will OVERWRITE the database "${db.database}" on ${db.host}:${db.port}`);
		console.error(`${LOG_PREFIX} with the contents of ${dumpPath}. This cannot be undone.`);
		console.error(`${LOG_PREFIX} Re-run with --yes if that is what you want.`);
		process.exit(1);
	}

	const passFilePath = join(tmpdir(), `flokie-restore-${randomBytes(6).toString('hex')}.pgpass`);
	await writeFile(passFilePath, `${db.host}:${db.port}:${db.database}:${db.user}:${db.password}\n`, {
		mode: 0o600,
	});

	const psqlArgs = [
		'--host',
		db.host,
		'--port',
		db.port,
		'--username',
		db.user,
		'--no-password',
		'--dbname',
		db.database,
		// Without this psql reports success even when statements failed part-way through.
		'--set',
		'ON_ERROR_STOP=1',
	];

	console.log(`${LOG_PREFIX} restoring ${dumpPath} → "${db.database}"`);

	await new Promise((resolve, reject) => {
		const psql = spawn('psql', psqlArgs, {
			stdio: ['pipe', 'inherit', 'inherit'],
			env: { ...process.env, PGPASSFILE: passFilePath },
		});

		psql.on('error', (error) => {
			if (error.code === 'ENOENT') {
				reject(
					new Error(
						'psql not found. Install the PostgreSQL client tools (e.g. `apt install postgresql-client`).',
					),
				);
			} else {
				reject(error);
			}
		});

		createReadStream(dumpPath).pipe(createGunzip()).pipe(psql.stdin);

		psql.on('close', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`psql exited with code ${code}`));
		});
	}).catch(async (error) => {
		await unlink(passFilePath).catch(() => {});
		console.error(`${LOG_PREFIX} FAILED: ${error.message}`);
		process.exit(1);
	});

	await unlink(passFilePath).catch(() => {});
	console.log(`${LOG_PREFIX} done. Run \`npx prisma generate\` if the schema changed.`);
}

await main();
