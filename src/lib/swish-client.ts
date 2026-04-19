/**
 * Client-side helpers for opening Swish from the browser.
 * Deep link shape per Swish integration practice (token + callback URL).
 */

/** Open Swish app on the same device to complete an MSS payment request. */
export function buildSwishPaymentRequestDeepLink(token: string, callbackUrl: string): string {
	const p = new URLSearchParams();
	p.set('token', token.trim());
	p.set('callbackurl', callbackUrl.trim());
	return `swish://paymentrequest?${p.toString()}`;
}

/**
 * True when the browser is probably a handheld phone paying on the same device
 * (exclude iPad / “desktop” Android tablets where scanning QR from another phone is typical).
 */
export function isLikelyMobilePaymentPhone(): boolean {
	if (typeof navigator === 'undefined') return false;
	const ua = navigator.userAgent || '';
	const maxTouch = (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints ?? 0;
	const iPad = /iPad/i.test(ua) || (navigator.platform === 'MacIntel' && maxTouch > 1);
	if (iPad) return false;
	return /iPhone|iPod|Android.+Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}
