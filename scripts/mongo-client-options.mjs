/**
 * Shared options for MongoDB Atlas from Node.js on Windows (TLS/DNS).
 * @see https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/
 */
export const mongoDriverOptions = {
	serverSelectionTimeoutMS: 25000,
	/** Prefer IPv4 — avoids some Windows / DNS setups that break TLS to Atlas. */
	family: 4
};

/**
 * @param {typeof import('mongodb').MongoClient} MongoClient
 * @param {string} uri
 */
export function createMongoClient(MongoClient, uri) {
	return new MongoClient(uri, mongoDriverOptions);
}

/**
 * The three-host `mongodb://...@shard-00-00...:27017,...` URI from older docs
 * often fails on Windows with `tlsv1 alert internal error`. Atlas expects `mongodb+srv://`.
 */
export function assertAtlasSrvUri(uri) {
	if (!/^mongodb\+srv:\/\//i.test(uri)) {
		const looksLikeAtlasShards =
			/^mongodb:\/\//i.test(uri) &&
			/@[^/]*shard-00-\d{2}\.[^/]+\.mongodb\.net/i.test(uri);
		if (looksLikeAtlasShards) {
			console.error(`
Your MONGODB_URI still uses the old multi-host mongodb://…shard-00-00… form.
That URI is what triggers the TLS error in your stack trace.

Do this:
  1. Atlas → your cluster → **Connect** → **Drivers** → **Node.js**.
  2. Copy the string that starts with **mongodb+srv://** (one hostname, not three).
  3. Put it in .env as MONGODB_URI=... and replace the password (URL-encode if needed).
  4. Save .env and run this script again.

The seed script refuses to connect with the deprecated URI so the failure is obvious.
`);
			process.exit(1);
		}
	}
}
