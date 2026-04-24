import { createPrivateKey, X509Certificate } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { Agent } from 'undici';
import { env } from '$env/dynamic/private';

function readEnv(key: string): string | undefined {
	const v = (env as Record<string, string | undefined>)[key];
	return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Prefer `process.env` for PEM bodies so Vercel-injected secrets match what Node TLS reads at handshake. */
function readPemEnvRaw(key: string): string | undefined {
	const fromProcess = process.env[key];
	if (typeof fromProcess === 'string' && fromProcess.length > 0) {
		return fromProcess;
	}
	const v = (env as Record<string, string | undefined>)[key];
	return typeof v === 'string' ? v : undefined;
}

const certDir = () => join(process.cwd(), 'client_cert');

/** Default filenames match Swish test bundle in `client_cert/`. */
const DEFAULT_CERT = 'Swish_Merchant_TestCertificate_1234679304.pem';
const DEFAULT_KEY = 'Swish_Merchant_TestCertificate_1234679304.key';
const DEFAULT_CA = 'Swish_TLS_RootCA.pem';

let cached: Agent | undefined | null;

function hasPemBegin(s: string): boolean {
	return /-----BEGIN [A-Z0-9 -]+-----/.test(s);
}

/** Word / Google Docs sometimes turn hyphens in BEGIN lines into Unicode dashes; OpenSSL rejects those. */
function normalizePemAsciiDashes(s: string): string {
	return s.replace(/\u2013/g, '-').replace(/\u2014/g, '-').replace(/\u2212/g, '-');
}

/**
 * Turns a Vercel/CI env string into PEM text Node TLS accepts.
 * Handles: UTF-8 BOM, `\r`, literal `\n` escapes, outer quotes, Unicode dashes in markers, and
 * **whole-value base64** (single-line env encoding of a full PEM file).
 */
function decodePemEnvValue(label: string, raw: string): string {
	let s = raw.replace(/^\uFEFF/, '');
	s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	for (let i = 0; i < 8 && s.includes('\\n'); i++) {
		s = s.replace(/\\n/g, '\n');
	}
	s = s.trim();
	if (
		(s.startsWith('"') && s.endsWith('"')) ||
		(s.startsWith("'") && s.endsWith("'"))
	) {
		s = s.slice(1, -1).trim();
	}
	if (!s) {
		throw new Error(`${label}: empty after normalizing`);
	}

	let text = normalizePemAsciiDashes(s);
	if (!hasPemBegin(text)) {
		const b64 = text.replace(/\s/g, '');
		try {
			const dec = normalizePemAsciiDashes(Buffer.from(b64, 'base64').toString('utf8'));
			if (hasPemBegin(dec)) {
				text = dec.trim();
			}
		} catch {
			/* not valid base64 */
		}
	}

	if (!hasPemBegin(text)) {
		throw new Error(
			`${label}: must contain a PEM header (-----BEGIN ...-----). If you pasted one long line, ` +
				`either use real line breaks in Vercel or paste the **base64 encoding of the entire PEM file** as the value.`
		);
	}

	return text;
}

function assertParsableTlsMaterials(certPem: string, keyPem: string, caPem: string): void {
	try {
		new X509Certificate(certPem);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw new Error(`SWISH_CLIENT_CERT_PEM is not a valid X.509 certificate PEM: ${msg}`);
	}
	try {
		createPrivateKey({ key: keyPem, format: 'pem' });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw new Error(`SWISH_CLIENT_KEY_PEM is not a valid private key PEM: ${msg}`);
	}
	try {
		new X509Certificate(caPem);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw new Error(`SWISH_TLS_ROOT_CA_PEM is not a valid X.509 certificate PEM: ${msg}`);
	}
}

function tryBuildAgentFromPemEnv(): Agent | null {
	const certRaw = readPemEnvRaw('SWISH_CLIENT_CERT_PEM');
	const keyRaw = readPemEnvRaw('SWISH_CLIENT_KEY_PEM');
	const caRaw = readPemEnvRaw('SWISH_TLS_ROOT_CA_PEM');
	const hasAny = Boolean(certRaw?.trim() || keyRaw?.trim() || caRaw?.trim());
	if (!hasAny) return null;
	if (!certRaw?.trim() || !keyRaw?.trim() || !caRaw?.trim()) {
		console.error(
			'[Swish MSS] TLS: set all of SWISH_CLIENT_CERT_PEM, SWISH_CLIENT_KEY_PEM, SWISH_TLS_ROOT_CA_PEM (or use *_PATH / client_cert/ instead).'
		);
		return null;
	}
	try {
		const certPem = decodePemEnvValue('SWISH_CLIENT_CERT_PEM', certRaw);
		const keyPem = decodePemEnvValue('SWISH_CLIENT_KEY_PEM', keyRaw);
		const caPem = decodePemEnvValue('SWISH_TLS_ROOT_CA_PEM', caRaw);
		assertParsableTlsMaterials(certPem, keyPem, caPem);
		/** Pass strings (UTF-8 PEM); avoids any Buffer serialization edge cases in the TLS stack. */
		return new Agent({
			connect: { cert: certPem, key: keyPem, ca: caPem }
		});
	} catch (e) {
		console.error('[Swish MSS] TLS: failed to parse PEM env', e);
		return null;
	}
}

/**
 * Undici `Agent` with client cert + Swish test CA for MSS/CPC (`mss.cpc.getswish.net`).
 * Cached for the process lifetime. Returns `null` if files are missing or unreadable.
 *
 * **Serverless (e.g. Vercel):** set `SWISH_CLIENT_CERT_PEM`, `SWISH_CLIENT_KEY_PEM`, and
 * `SWISH_TLS_ROOT_CA_PEM` to the full PEM text (multiline in the dashboard, or one line with `\n` escapes).
 */
export function getSwishMssTlsAgent(): Agent | null {
	if (cached !== undefined) return cached;

	const fromPem = tryBuildAgentFromPemEnv();
	if (fromPem) {
		cached = fromPem;
		console.log('[Swish MSS] TLS: client certificate agent ready (from SWISH_*_PEM env)');
		return cached;
	}
	if (
		readPemEnvRaw('SWISH_CLIENT_CERT_PEM') ||
		readPemEnvRaw('SWISH_CLIENT_KEY_PEM') ||
		readPemEnvRaw('SWISH_TLS_ROOT_CA_PEM')
	) {
		cached = null;
		return null;
	}

	const certPath = readEnv('SWISH_CLIENT_CERT_PATH') ?? join(certDir(), DEFAULT_CERT);
	const keyPath = readEnv('SWISH_CLIENT_KEY_PATH') ?? join(certDir(), DEFAULT_KEY);
	const caPath = readEnv('SWISH_TLS_ROOT_CA_PATH') ?? join(certDir(), DEFAULT_CA);

	for (const [label, p] of [
		['cert', certPath],
		['key', keyPath],
		['ca', caPath]
	] as const) {
		if (!existsSync(p)) {
			console.error(`[Swish MSS] TLS: missing ${label} file: ${p}`);
			cached = null;
			return null;
		}
	}

	try {
		const cert = readFileSync(certPath);
		const key = readFileSync(keyPath);
		const ca = readFileSync(caPath);
		cached = new Agent({
			connect: {
				cert,
				key,
				ca
			}
		});
		console.log('[Swish MSS] TLS: client certificate agent ready', {
			certPath,
			keyPath,
			caPath
		});
		return cached;
	} catch (e) {
		console.error('[Swish MSS] TLS: failed to read certificate files', e);
		cached = null;
		return null;
	}
}
