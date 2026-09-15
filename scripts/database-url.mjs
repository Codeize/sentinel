/**
 * Shared database connection resolution for the standalone scripts in this folder.
 *
 * `.env` defines DATABASE_URL using `${DATABASE_USERNAME}`-style interpolation, which the Prisma
 * CLI expands but plain Node does not (neither `process.env` nor `node --env-file` interpolate).
 * So when the URL still contains a `${`, it is rebuilt from the individual DATABASE_* values.
 */

import { readFileSync } from 'node:fs';

export function readEnvValue(content, key) {
	const match = content.match(new RegExp(`^\\s*${key}\\s*=(.*)$`, 'm'));
	if (!match) return null;
	const value = match[1].trim();
	// Strip surrounding quotes and any trailing inline comment outside the quotes.
	const quoted = value.match(/^"([^"]*)"/) ?? value.match(/^'([^']*)'/);
	if (quoted) return quoted[1];
	return value.replace(/\s+#.*$/, '').trim();
}

export function buildDatabaseUrl(envPath = '.env') {
	if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('${')) {
		return process.env.DATABASE_URL;
	}

	const env = readFileSync(envPath, 'utf8');
	const user = encodeURIComponent(readEnvValue(env, 'DATABASE_USERNAME') ?? 'postgres');
	const pass = encodeURIComponent(readEnvValue(env, 'DATABASE_PASSWORD') ?? '');
	const host = readEnvValue(env, 'DATABASE_HOST') ?? 'localhost';
	const port = readEnvValue(env, 'DATABASE_PORT') ?? '5432';
	const name = readEnvValue(env, 'DATABASE_NAME') ?? 'postgres';
	return `postgresql://${user}:${pass}@${host}:${port}/${name}`;
}

/** Splits a connection URL into the pieces pg_dump and psql need as flags. */
export function parseDatabaseUrl(raw, logPrefix) {
	if (!raw) {
		console.error(`${logPrefix} Could not resolve a database URL. Is .env present?`);
		process.exit(1);
	}

	const url = new URL(raw);
	const database = decodeURIComponent(url.pathname.replace(/^\//, ''));

	if (!database) {
		console.error(`${logPrefix} No database name in the connection URL.`);
		process.exit(1);
	}

	return {
		host: url.hostname || 'localhost',
		port: url.port || '5432',
		user: decodeURIComponent(url.username || 'postgres'),
		password: decodeURIComponent(url.password || ''),
		database,
	};
}
