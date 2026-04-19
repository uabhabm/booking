import { env } from '$env/dynamic/private';
import { MongoClient, type Db } from 'mongodb';

let client: MongoClient | undefined;
let dbInstance: Db | undefined;
let connecting: Promise<Db | null> | null = null;

/** Read private env (incl. `.env` in dev) — raw `process.env` is not populated for app code. */
function readEnv(key: string): string | undefined {
	const v = (env as Record<string, string | undefined>)[key];
	return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export function isDatabaseConfigured(): boolean {
	return Boolean(readEnv('MONGODB_URI'));
}

/** Atlas multi-host `mongodb://...@shard-00-00...:27017,...` URIs often fail TLS on Windows; use `mongodb+srv://` from Atlas. */
function assertAtlasUriNotDeprecatedDirectHosts(uri: string): void {
	const looksLikeAtlasShards =
		/^mongodb:\/\//i.test(uri) &&
		/@[^/]*shard-00-\d{2}\.[^/]+\.mongodb\.net/i.test(uri);
	if (looksLikeAtlasShards) {
		throw new Error(
			'MONGODB_URI uses the old multi-host mongodb://…shard-00-00… form. Replace it with mongodb+srv:// from Atlas → Connect → Drivers (Node.js). See schema.mongodb.md.'
		);
	}
}

async function ensureIndexes(database: Db): Promise<void> {
	await database.collection('bookings').createIndex({ object_id: 1, date: 1 });
}

/**
 * Shared MongoDB database handle (Atlas or local).
 * Set `MONGODB_URI` and optional `MONGODB_DB` (default `booking`).
 */
export async function getDb(): Promise<Db | null> {
	if (!isDatabaseConfigured()) return null;
	if (dbInstance) return dbInstance;
	if (!connecting) {
		connecting = (async () => {
			const uri = readEnv('MONGODB_URI')!;
			assertAtlasUriNotDeprecatedDirectHosts(uri);
			const dbName = readEnv('MONGODB_DB') ?? 'booking';
			const c = new MongoClient(uri, {
				serverSelectionTimeoutMS: 25000,
				/** Prefer IPv4 — helps some Windows / DNS setups connecting to Atlas. */
				family: 4
			});
			await c.connect();
			client = c;
			dbInstance = c.db(dbName);
			await ensureIndexes(dbInstance);
			return dbInstance;
		})().catch((e) => {
			connecting = null;
			dbInstance = undefined;
			client = undefined;
			throw e;
		});
	}
	return connecting;
}
