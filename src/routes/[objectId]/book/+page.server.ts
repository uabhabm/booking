import { fail } from '@sveltejs/kit';
import {
	bookingFieldDefaults,
	isFieldEmpty,
	valueOrDefault,
	type BookingFormFieldKey
} from '$lib/booking-defaults';
import { mondayOfWeekContaining, todayYMDStockholm } from '$lib/calendar';
import {
	createSlotBooking,
	DEFAULT_TOTAL_TO_PAY_LABEL,
	FIRST_HOUR,
	getBookableObject,
	isSlotBooked,
	LAST_START_HOUR,
	loadBookingPage,
	slotRowId
} from '$lib/server/booking-data';
import { isDatabaseConfigured } from '$lib/server/db';
import {
	createMssPaymentRequest,
	fetchSwishCommerceQrDataUrl,
	getConfiguredSwishPayeeAlias,
	getSwishCallbackUrl
} from '$lib/server/swish-mss';
import type { Actions, PageServerLoad } from './$types';

/** Swish `message` max 50 chars (see `createMssPaymentRequest`). Object name + date + time slot. */
function swishPaymentRequestMessage(objectName: string, dateYmd: string, hour: number): string {
	const start = `${String(hour).padStart(2, '0')}:00`;
	const end = `${String(hour + 1).padStart(2, '0')}:00`;
	const slot = `${start}–${end}`;
	return `${objectName.trim()} · ${dateYmd} · ${slot}`.slice(0, 50);
}

export const load: PageServerLoad = async ({ url, params }) => {
	const date = url.searchParams.get('date');
	const hourRaw = url.searchParams.get('hour');
	const vecka = url.searchParams.get('vecka');

	if (!isDatabaseConfigured()) {
		return {
			configured: false as const,
			unavailable: null as string | null,
			objectId: params.objectId,
			objectName: '',
			bookingPrice: 0,
			requiresSwish: false,
			totalToPayLabel: DEFAULT_TOTAL_TO_PAY_LABEL,
			date: '',
			hour: 0,
			weekStart: mondayOfWeekContaining(todayYMDStockholm()),
			defaults: bookingFieldDefaults
		};
	}

	const weekAnchor =
		vecka && /^\d{4}-\d{2}-\d{2}$/.test(vecka)
			? vecka
			: date && /^\d{4}-\d{2}-\d{2}$/.test(date)
				? date
				: todayYMDStockholm();
	const page = await loadBookingPage({
		weekStart: mondayOfWeekContaining(weekAnchor),
		objectId: params.objectId,
		objectSelection: 'exact'
	});

	if (page.objects.length > 0 && !page.selectedObjectId) {
		return {
			configured: true as const,
			unavailable: 'Bokningsobjektet finns inte.' as const,
			objectId: params.objectId,
			objectName: '',
			bookingPrice: 0,
			requiresSwish: false,
			totalToPayLabel: DEFAULT_TOTAL_TO_PAY_LABEL,
			date: date ?? '',
			hour: 0,
			weekStart: page.weekStart,
			defaults: bookingFieldDefaults
		};
	}

	if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		const o = page.objects.find((x) => x.id === params.objectId);
		return {
			configured: true as const,
			unavailable: 'Saknat eller ogiltigt datum.' as const,
			objectId: params.objectId,
			objectName: o?.name ?? '',
			bookingPrice: o?.bookingPrice ?? 0,
			requiresSwish: (o?.bookingPrice ?? 0) > 0,
			totalToPayLabel: o?.totalToPayLabel ?? DEFAULT_TOTAL_TO_PAY_LABEL,
			date: '',
			hour: 0,
			weekStart: page.weekStart,
			defaults: bookingFieldDefaults
		};
	}

	const hour = Number.parseInt(hourRaw ?? '', 10);
	if (!Number.isInteger(hour) || hour < FIRST_HOUR || hour > LAST_START_HOUR) {
		const o = page.objects.find((x) => x.id === params.objectId);
		return {
			configured: true as const,
			unavailable: 'Saknad eller ogiltig tid.' as const,
			objectId: params.objectId,
			objectName: o?.name ?? '',
			bookingPrice: o?.bookingPrice ?? 0,
			requiresSwish: (o?.bookingPrice ?? 0) > 0,
			totalToPayLabel: o?.totalToPayLabel ?? DEFAULT_TOTAL_TO_PAY_LABEL,
			date,
			hour: 0,
			weekStart: page.weekStart,
			defaults: bookingFieldDefaults
		};
	}

	if (await isSlotBooked(params.objectId, date, hour)) {
		const o = page.objects.find((x) => x.id === params.objectId);
		return {
			configured: true as const,
			unavailable: 'Tiden är redan bokad.' as const,
			objectId: params.objectId,
			objectName: o?.name ?? '',
			bookingPrice: o?.bookingPrice ?? 0,
			requiresSwish: (o?.bookingPrice ?? 0) > 0,
			totalToPayLabel: o?.totalToPayLabel ?? DEFAULT_TOTAL_TO_PAY_LABEL,
			date,
			hour,
			weekStart: page.weekStart,
			defaults: bookingFieldDefaults
		};
	}

	const o = page.objects.find((x) => x.id === params.objectId);
	const objectName = o?.name ?? '';
	const bookingPrice = o?.bookingPrice ?? 0;
	const totalToPayLabel = o?.totalToPayLabel ?? DEFAULT_TOTAL_TO_PAY_LABEL;

	return {
		configured: true as const,
		unavailable: null as string | null,
		objectId: params.objectId,
		objectName,
		bookingPrice,
		requiresSwish: bookingPrice > 0,
		totalToPayLabel,
		date,
		hour,
		weekStart: page.weekStart,
		defaults: bookingFieldDefaults
	};
};

export const actions: Actions = {
	book: async ({ request, params }) => {
		const formData = await request.formData();
		const date = formData.get('date');
		const hourRaw = formData.get('hour');
		if (typeof date !== 'string' || typeof hourRaw !== 'string') {
			return fail(400, { message: 'Ogiltig begäran.' });
		}
		const hour = Number.parseInt(hourRaw, 10);
		if (!Number.isInteger(hour) || hour < FIRST_HOUR || hour > LAST_START_HOUR) {
			return fail(400, { message: 'Ogiltig tid.' });
		}
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			return fail(400, { message: 'Ogiltigt datum.' });
		}

		const usedDefaultsFor: BookingFormFieldKey[] = [];
		if (isFieldEmpty(formData.get('guestName'))) usedDefaultsFor.push('guestName');
		if (isFieldEmpty(formData.get('guestEmail'))) usedDefaultsFor.push('guestEmail');
		if (isFieldEmpty(formData.get('guestPhone'))) usedDefaultsFor.push('guestPhone');
		if (isFieldEmpty(formData.get('label'))) usedDefaultsFor.push('label');

		const guestName = valueOrDefault(formData.get('guestName'), bookingFieldDefaults.guestName);
		const guestEmail = valueOrDefault(formData.get('guestEmail'), bookingFieldDefaults.guestEmail);
		const guestPhone = valueOrDefault(formData.get('guestPhone'), bookingFieldDefaults.guestPhone);
		const label = valueOrDefault(formData.get('label'), bookingFieldDefaults.label);

		const object = await getBookableObject(params.objectId);
		if (!object) return fail(400, { message: 'Bokningsobjektet finns inte.' });

		let swishPaymentRequestUuid: string | null = null;
		let qrDataUrl: string | null = null;
		let swishCheckout:
			| {
					payeeAlias: string;
					amountSek: number;
					payeePaymentReference: string;
					message: string;
					/** MSS token for `swish://paymentrequest` on the payer’s phone. */
					paymentRequestToken: string;
					callbackUrl: string;
			  }
			| undefined;
		if (object.bookingPrice > 0) {
			const payeeRef = slotRowId(params.objectId, date, hour).slice(0, 35);
			const swishMessage = swishPaymentRequestMessage(object.name, date, hour);
			const swish = await createMssPaymentRequest({
				amountSek: object.bookingPrice,
				payeePaymentReference: payeeRef,
				message: swishMessage
			});
			if (!swish.ok) return fail(400, { message: swish.message });
			swishPaymentRequestUuid = swish.paymentRequestToken;

			const qr = await fetchSwishCommerceQrDataUrl(swish.paymentRequestToken);
			if (!qr.ok) return fail(400, { message: qr.message });
			qrDataUrl = qr.dataUrl;
			swishCheckout = {
				payeeAlias: getConfiguredSwishPayeeAlias(),
				amountSek: object.bookingPrice,
				payeePaymentReference: payeeRef,
				message: swishMessage,
				paymentRequestToken: swish.paymentRequestToken,
				callbackUrl: getSwishCallbackUrl()
			};
		}

		const result = await createSlotBooking({
			objectId: params.objectId,
			date,
			hour,
			guestName,
			guestEmail,
			guestPhone,
			label,
			bookingPrice: object.bookingPrice,
			swishPaymentRequestUuid
		});
		if (!result.ok) return fail(400, { message: result.message });

		return {
			success: true as const,
			usedDefaultsFor,
			...(qrDataUrl ? { qrDataUrl, swishCheckout } : {})
		};
	}
};
