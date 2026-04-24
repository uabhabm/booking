import { env } from '$env/dynamic/private';
import { fetch as undiciFetch } from 'undici';
import { getSwishMssTlsAgent } from './swish-mss-tls';

const LOG_PREFIX_MSS = '[Swish MSS]';
const LOG_PREFIX_QR = '[Swish QR]';

/** Works with undici and DOM `Headers` without conflicting lib typings. */
function headersToRecord(headers: { forEach(cb: (value: string, key: string) => void): void }): Record<string, string> {
	const out: Record<string, string> = {};
	headers.forEach((value, key) => {
		out[key] = value;
	});
	return out;
}

/** Avoid huge log lines (e.g. binary noise). */
function truncateForLog(text: string, max = 4000): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max)}… (${text.length} chars total)`;
}

/**
 * Normalizes Swish `payeeAlias` to 10-digit Swedish format (e.g. 0046768593696 / +46 → 0768593696).
 * Override with `SWISH_PAYEE_ALIAS` in `.env` if you use another number.
 */
export function normalizeSwishPayeeAlias(raw: string): string {
	const d = raw.replace(/\D/g, '');
	if (d.length === 0) return raw.trim();
	let x = d;
	if (x.startsWith('00')) {
		x = x.slice(2);
	}
	if (x.startsWith('46') && x.length === 11) {
		return `0${x.slice(2)}`;
	}
	if (x.length === 10 && x.startsWith('0')) {
		return x;
	}
	return x;
}

/** Default mottagare: 0046768593696 → 0768593696 (samma som skickas till MSS). */
export const SWISH_PAYEE_ALIAS = normalizeSwishPayeeAlias('0046768593696');

const DEFAULT_PAYMENT_REQUESTS_URL =
	'https://mss.cpc.getswish.net/swish-cpcapi/api/v1/paymentrequests/';

/** Swish QR “commerce” API ([QR codes – Mcom to Qcom](https://developer.swish.nu/api/qr-codes/v1#mcom-to-qcom)). */
const DEFAULT_QR_COMMERCE_URL = 'https://mpc.getswish.net/qrg-swish/api/v1/commerce';

function readEnv(key: string): string | undefined {
	const v = (env as Record<string, string | undefined>)[key];
	return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Payee number shown in checkout (same as sent to MSS). */
export function getConfiguredSwishPayeeAlias(): string {
	const v = readEnv('SWISH_PAYEE_ALIAS');
	return v ? normalizeSwishPayeeAlias(v) : SWISH_PAYEE_ALIAS;
}

/** Callback URL sent to MSS (also used in `swish://` deep link on phones). */
export function getSwishCallbackUrl(): string {
	return readEnv('SWISH_CALLBACK_URL') ?? 'https://example.com/swish-callback';
}

function paymentRequestTokenFromHeaders(headers: {
	forEach(cb: (value: string, key: string) => void): void;
}): string | null {
	let result: string | null = null;
	headers.forEach((v, k) => {
		if (result) return;
		const kl = k.toLowerCase().replace(/_/g, '-');
		if (
			(kl === 'payment-request-token' || kl === 'paymentrequesttoken') &&
			typeof v === 'string' &&
			v.trim()
		) {
			result = v.trim();
		}
	});
	return result;
}

function paymentRequestTokenFromBody(j: Record<string, unknown> | null): string | null {
	if (!j) return null;
	if (typeof j.paymentRequestToken === 'string' && j.paymentRequestToken.trim()) {
		return j.paymentRequestToken.trim();
	}
	return null;
}

async function fetchTokenFromPaymentLocation(
	locationUrl: string,
	dispatcher: NonNullable<ReturnType<typeof getSwishMssTlsAgent>>
): Promise<string | null> {
	const reqHeaders = { Accept: 'application/json' };
	console.log(`${LOG_PREFIX_MSS} GET payment (token lookup)`, {
		url: locationUrl,
		headers: reqHeaders
	});
	try {
		const res = await undiciFetch(locationUrl, {
			method: 'GET',
			headers: reqHeaders,
			dispatcher
		});
		const rawText = await res.text();
		console.log(`${LOG_PREFIX_MSS} GET payment response`, {
			status: res.status,
			statusText: res.statusText,
			headers: headersToRecord(res.headers),
			body: truncateForLog(rawText)
		});
		if (!res.ok) return null;
		let j: Record<string, unknown>;
		try {
			j = JSON.parse(rawText) as Record<string, unknown>;
		} catch {
			return null;
		}
		return paymentRequestTokenFromBody(j);
	} catch (e) {
		console.log(`${LOG_PREFIX_MSS} GET payment error`, e);
		return null;
	}
}

export type MssPaymentRequestInput = {
	amountSek: number;
	payeePaymentReference: string;
	message: string;
};

/**
 * Creates a payment request in the [Swish Merchant Simulator](https://developer.swish.nu/api/mss/v1).
 * **Omits `payerAlias`** so a [commerce QR code](https://developer.swish.nu/api/qr-codes/v1#mcom-to-qcom) can be generated.
 * On success the API returns HTTP 201. `paymentRequestToken` is read from headers or payment resource JSON.
 */
export async function createMssPaymentRequest(
	input: MssPaymentRequestInput
): Promise<{ ok: true; paymentRequestToken: string } | { ok: false; message: string }> {
	const url = readEnv('SWISH_MSS_PAYMENT_REQUESTS_URL') ?? DEFAULT_PAYMENT_REQUESTS_URL;
	const callbackUrl =
		readEnv('SWISH_CALLBACK_URL') ?? 'https://example.com/swish-callback';

	const amount = Number(input.amountSek);
	if (!Number.isFinite(amount) || amount <= 0) {
		return { ok: false, message: 'Ogiltigt belopp för Swish.' };
	}

	const payeeAlias = getConfiguredSwishPayeeAlias();
	const body = {
		payeePaymentReference: input.payeePaymentReference.slice(0, 35),
		callbackUrl,
		payeeAlias,
		amount: amount.toFixed(2),
		currency: 'SEK',
		message: input.message.slice(0, 50)
	};

	const reqHeaders = {
		'Content-Type': 'application/json',
		Accept: 'application/json'
	};

	const dispatcher = getSwishMssTlsAgent();
	if (!dispatcher) {
		return {
			ok: false,
			message:
				'Saknar Swish MSS TLS: lägg filer i client_cert/ eller sätt SWISH_CLIENT_CERT_PATH, SWISH_CLIENT_KEY_PATH, SWISH_TLS_ROOT_CA_PATH. På Vercel/serverless: sätt SWISH_CLIENT_CERT_PEM, SWISH_CLIENT_KEY_PEM och SWISH_TLS_ROOT_CA_PEM (hela PEM-innehållet).'
		};
	}

	try {
		console.log(`${LOG_PREFIX_MSS} POST paymentrequests request`, {
			url,
			method: 'POST',
			headers: reqHeaders,
			body
		});

		const res = await undiciFetch(url, {
			method: 'POST',
			headers: reqHeaders,
			body: JSON.stringify(body),
			dispatcher
		});

		const rawText = await res.text();
		console.log(`${LOG_PREFIX_MSS} POST paymentrequests response`, {
			status: res.status,
			statusText: res.statusText,
			headers: headersToRecord(res.headers),
			body: truncateForLog(rawText)
		});

		let json: Record<string, unknown> | null = null;
		if (rawText) {
			try {
				json = JSON.parse(rawText) as Record<string, unknown>;
			} catch {
				/* non-JSON body */
			}
		}

		if (res.status !== 201) {
			return {
				ok: false,
				message: `Swish MSS svarade med HTTP ${res.status}: ${rawText.slice(0, 280)}`
			};
		}

		let paymentRequestToken =
			paymentRequestTokenFromHeaders(res.headers) ?? paymentRequestTokenFromBody(json);

		const location = res.headers.get('Location');
		if (!paymentRequestToken && location) {
			paymentRequestToken = await fetchTokenFromPaymentLocation(location, dispatcher);
		}

		if (!paymentRequestToken) {
			console.log(`${LOG_PREFIX_MSS} missing paymentRequestToken after 201`, {
				location: res.headers.get('Location'),
				parsedJsonKeys: json ? Object.keys(json) : []
			});
			return {
				ok: false,
				message:
					'Svar 201 från Swish MSS saknar paymentRequestToken (header Location/JSON). Kan inte skapa QR.'
			};
		}

		console.log(`${LOG_PREFIX_MSS} paymentRequestToken resolved`, {
			tokenPreview: `${paymentRequestToken.slice(0, 8)}…`
		});

		return { ok: true, paymentRequestToken };
	} catch (e) {
		console.log(`${LOG_PREFIX_MSS} POST paymentrequests fetch error`, e);
		return { ok: false, message: e instanceof Error ? e.message : String(e) };
	}
}

/**
 * Fetches a QR image for a payment request token via the commerce endpoint
 * ([Swish QR API](https://developer.swish.nu/api/qr-codes) / `qrg-swish` service).
 */
export async function fetchSwishCommerceQrDataUrl(
	paymentRequestToken: string,
	options?: { format?: string; size?: number; transparent?: boolean }
): Promise<{ ok: true; dataUrl: string } | { ok: false; message: string }> {
	const url = readEnv('SWISH_QR_COMMERCE_URL') ?? DEFAULT_QR_COMMERCE_URL;
	const payload = {
		token: paymentRequestToken,
		format: options?.format ?? 'png',
		size: options?.size ?? 400,
		transparent: options?.transparent ?? true
	};

	const reqHeaders = {
		'Content-Type': 'application/json',
		Accept: 'image/png, image/jpeg, application/json'
	};

	try {
		console.log(`${LOG_PREFIX_QR} POST commerce request`, {
			url,
			method: 'POST',
			headers: reqHeaders,
			body: {
				...payload,
				token: `${String(payload.token).slice(0, 8)}… (${String(payload.token).length} chars)`
			}
		});

		const res = await fetch(url, {
			method: 'POST',
			headers: reqHeaders,
			body: JSON.stringify(payload)
		});

		const ct = res.headers.get('content-type') ?? '';

		if (!res.ok) {
			const errText = await res.text();
			console.log(`${LOG_PREFIX_QR} POST commerce response (error)`, {
				status: res.status,
				statusText: res.statusText,
				headers: headersToRecord(res.headers),
				body: truncateForLog(errText, 2000)
			});
			return {
				ok: false,
				message: `Swish QR (commerce): HTTP ${res.status}: ${errText.slice(0, 240)}`
			};
		}

		const mime = ct.split(';')[0]?.trim() || 'image/png';
		const buf = Buffer.from(await res.arrayBuffer());
		console.log(`${LOG_PREFIX_QR} POST commerce response (ok)`, {
			status: res.status,
			statusText: res.statusText,
			headers: headersToRecord(res.headers),
			contentType: mime,
			bodyByteLength: buf.length,
			bodyPreviewHex: buf.subarray(0, 24).toString('hex')
		});
		const b64 = buf.toString('base64');
		return { ok: true, dataUrl: `data:${mime};base64,${b64}` };
	} catch (e) {
		console.log(`${LOG_PREFIX_QR} POST commerce fetch error`, e);
		return { ok: false, message: e instanceof Error ? e.message : String(e) };
	}
}
