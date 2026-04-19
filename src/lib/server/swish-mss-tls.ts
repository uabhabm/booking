import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Agent } from 'undici';
import { env } from '$env/dynamic/private';

function readEnv(key: string): string | undefined {
	const v = (env as Record<string, string | undefined>)[key];
	return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

const certDir = () => join(process.cwd(), 'client_cert');

/** Default filenames match Swish test bundle in `client_cert/`. */
const DEFAULT_CERT = 'Swish_Merchant_TestCertificate_1234679304.pem';
const DEFAULT_KEY = 'Swish_Merchant_TestCertificate_1234679304.key';
const DEFAULT_CA = 'Swish_TLS_RootCA.pem';

let cached: Agent | undefined | null;

/**
 * Undici `Agent` with client cert + Swish test CA for MSS/CPC (`mss.cpc.getswish.net`).
 * Cached for the process lifetime. Returns `null` if files are missing or unreadable.
 */
export function getSwishMssTlsAgent(): Agent | null {
	if (cached !== undefined) return cached;

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
