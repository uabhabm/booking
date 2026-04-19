/**
 * Minimal `.env` reader (MONGODB_URI, MONGODB_DB only) — no extra npm deps.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadRootEnv() {
	const envPath = join(__dirname, '..', '.env');
	let raw;
	try {
		raw = readFileSync(envPath, 'utf8');
	} catch {
		throw new Error(`Missing .env at ${envPath}. Copy .env.example to .env and set MONGODB_URI.`);
	}
	for (const line of raw.split(/\r?\n/)) {
		const t = line.trim();
		if (!t || t.startsWith('#')) continue;
		const eq = t.indexOf('=');
		if (eq === -1) continue;
		const k = t.slice(0, eq).trim();
		if (k !== 'MONGODB_URI' && k !== 'MONGODB_DB') continue;
		let v = t.slice(eq + 1).trim();
		if (
			(v.startsWith('"') && v.endsWith('"')) ||
			(v.startsWith("'") && v.endsWith("'"))
		) {
			v = v.slice(1, -1);
		}
		process.env[k] = v;
	}
}
