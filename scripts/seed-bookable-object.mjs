#!/usr/bin/env node
/**
 * Inserts one example bookable_objects document using MONGODB_URI / MONGODB_DB from .env
 * Usage: node scripts/seed-bookable-object.mjs
 * Optional: FIRST_ARG = custom _id (default: demo-studio)
 */
import { MongoClient } from 'mongodb';
import { assertAtlasSrvUri, createMongoClient } from './mongo-client-options.mjs';
import { loadRootEnv } from './read-env.js';

loadRootEnv();

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB ?? 'booking';

if (!uri || uri.includes('<db_password>')) {
	console.error(
		'Set MONGODB_URI in .env with your real Atlas password (replace <db_password>).'
	);
	process.exit(1);
}

assertAtlasSrvUri(uri);

const objectId = process.argv[2] ?? 'demo-studio';

const doc = {
	_id: objectId,
	name: 'Demo studio',
	booking_price: 500,
	total_to_pay_label: 'Totalt att betala:'
};

const client = createMongoClient(MongoClient, uri);
try {
	await client.connect();
	const db = client.db(dbName);
	const col = db.collection('bookable_objects');
	await col.insertOne(doc);
	console.log(`Inserted bookable_objects with _id "${objectId}" in database "${dbName}".`);
	console.log(`Open: /${encodeURIComponent(objectId)}`);
} catch (e) {
	if (e?.code === 11000) {
		console.error(`A document with _id "${objectId}" already exists. Use another id or delete it in Atlas/Compass.`);
		process.exit(1);
	}
	const msg = String(e?.message ?? e);
	const tls = /SSL|TLS|tlsv1|ECONNRESET|MongoServerSelectionError|ReplicaSetNoPrimary/i.test(msg);
	if (tls) {
		console.error(`
Connection failed (often TLS / server selection on Windows with the long mongodb:// host list).

Fix:
  1. Atlas → your cluster → Connect → Drivers → choose Node.js.
  2. Copy the **mongodb+srv://** connection string (single host like cluster0.xxxxx.mongodb.net).
     Do not use the three-host mongodb://ac-...shard-00-00,... style URI if you see this error.
  3. Replace <password> with your DB user password. If it contains @ # % etc., URL-encode it
     (e.g. in Node: encodeURIComponent('your-password')).
  4. Atlas → Network Access → add your current IP (or 0.0.0.0/0 for testing only).

Docs: https://www.mongodb.com/docs/atlas/troubleshoot-connection/

Original error:
`);
	}
	console.error(e);
	process.exit(1);
} finally {
	await client.close();
}
