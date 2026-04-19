import { env } from '$env/dynamic/private';
import mysql from 'mysql2/promise';

let pool: mysql.Pool | undefined;

/** Read private env (incl. `.env` in dev) — raw `process.env` is not populated for app code. */
function readEnv(key: string): string | undefined {
	const v = (env as Record<string, string | undefined>)[key];
	return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export function isDatabaseConfigured(): boolean {
	if (readEnv('DATABASE_URL')) return true;
	return Boolean(
		readEnv('MYSQL_HOST') && readEnv('MYSQL_USER') && readEnv('MYSQL_DATABASE')
	);
}

function poolOptions(): mysql.PoolOptions {
	const url = readEnv('DATABASE_URL');
	if (url) {
		const u = new URL(url);
		if (u.protocol !== 'mysql:' && u.protocol !== 'mysqls:') {
			throw new Error('DATABASE_URL must use mysql:// or mysqls://');
		}
		const database = decodeURIComponent(u.pathname.replace(/^\//, '').split('?')[0] ?? '');
		return {
			host: u.hostname,
			port: u.port ? Number(u.port) : 3306,
			user: decodeURIComponent(u.username),
			password: decodeURIComponent(u.password),
			database,
			waitForConnections: true,
			connectionLimit: 10,
			dateStrings: true
		};
	}
	return {
		host: readEnv('MYSQL_HOST')!,
		port: Number(readEnv('MYSQL_PORT') || 3306),
		user: readEnv('MYSQL_USER')!,
		password: readEnv('MYSQL_PASSWORD') ?? '',
		database: readEnv('MYSQL_DATABASE')!,
		waitForConnections: true,
		connectionLimit: 10,
		dateStrings: true
	};
}

export function getPool(): mysql.Pool | null {
	if (!isDatabaseConfigured()) return null;
	pool ??= mysql.createPool(poolOptions());
	return pool;
}
