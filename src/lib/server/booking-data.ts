import { isoWeekNumber, isoWeekYear, weekDayDates } from '$lib/calendar';
import { getDb } from './db';

type BookableObjectDoc = {
	_id: string;
	name: string;
	booking_price?: unknown;
	total_to_pay_label?: string | null;
};

type BookingDocument = {
	_id: string;
	object_id: string;
	date: string;
	hour: number;
	guest_name: string;
	guest_email: string;
	guest_phone: string;
	label: string;
	booking_price: number;
	swish_payment_request_uuid: string | null;
	created_at?: Date;
};

/** Fallback when `total_to_pay_label` is missing or blank. */
export const DEFAULT_TOTAL_TO_PAY_LABEL = 'Totalt att betala:';

export const FIRST_HOUR = 8;
export const LAST_START_HOUR = 16; /** Last slot starts 16:00 and ends 17:00 */

export const HOUR_SLOTS = Array.from(
	{ length: LAST_START_HOUR - FIRST_HOUR + 1 },
	(_, i) => FIRST_HOUR + i
);

export type BookableObject = {
	id: string;
	name: string;
	bookingPrice: number;
	/** Label text before the price (e.g. "Totalt att betala:"). */
	totalToPayLabel: string;
};

export type PageLoadResult = {
	configured: boolean;
	error?: string;
	objects: BookableObject[];
	selectedObjectId: string | null;
	weekStart: string;
	isoWeek: number;
	isoWeekYear: number;
	dayDates: string[];
	bookedSlotKeys: string[];
};

export function slotRowId(objectId: string, date: string, hour: number): string {
	return `${objectId}_${date}_${hour}`;
}

function isDuplicateKey(e: unknown): boolean {
	const code = (e as { code?: number })?.code;
	return code === 11000;
}

function docToBookableObject(d: BookableObjectDoc): BookableObject {
	const raw = d.booking_price;
	const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? '0'));
	const label = String(d.total_to_pay_label ?? '').trim();
	return {
		id: d._id,
		name: String(d.name ?? d._id),
		bookingPrice: Number.isFinite(n) ? n : 0,
		totalToPayLabel: label || DEFAULT_TOTAL_TO_PAY_LABEL
	};
}

export async function isSlotBooked(objectId: string, date: string, hour: number): Promise<boolean> {
	const db = await getDb();
	if (!db) return true;
	const id = slotRowId(objectId, date, hour);
	const n = await db
		.collection<BookingDocument>('bookings')
		.countDocuments({ _id: id }, { limit: 1 });
	return n > 0;
}

export async function getBookableObject(id: string): Promise<BookableObject | null> {
	const db = await getDb();
	if (!db) return null;
	const doc = await db.collection<BookableObjectDoc>('bookable_objects').findOne({ _id: id });
	return doc ? docToBookableObject(doc) : null;
}

export async function listBookableObjects(): Promise<BookableObject[]> {
	const db = await getDb();
	if (!db) return [];
	const cursor = db
		.collection<BookableObjectDoc>('bookable_objects')
		.find({})
		.sort({ name: 1 });
	const docs = await cursor.toArray();
	return docs.map(docToBookableObject);
}

export async function loadBookingPage(params: {
	weekStart: string;
	objectId: string | null;
	/** `exact`: unknown id does not fall back to the first object (for `/[objectId]` routes). */
	objectSelection?: 'default' | 'exact';
}): Promise<PageLoadResult> {
	const monday = params.weekStart;
	const dayDates = weekDayDates(monday);

	const db = await getDb();
	if (!db) {
		return {
			configured: false,
			objects: [],
			selectedObjectId: null,
			weekStart: monday,
			isoWeek: 0,
			isoWeekYear: 0,
			dayDates,
			bookedSlotKeys: []
		};
	}

	try {
		const objects = await listBookableObjects();
		const selectedObjectId =
			params.objectId && objects.some((o) => o.id === params.objectId)
				? params.objectId
				: params.objectSelection === 'exact'
					? null
					: objects[0]?.id ?? null;

		let bookedSlotKeys: string[] = [];
		if (selectedObjectId) {
			const weekStart = dayDates[0]!;
			const weekEnd = dayDates[6]!;
			const rows = await db
				.collection<Pick<BookingDocument, 'date' | 'hour'>>('bookings')
				.find(
					{
						object_id: selectedObjectId,
						date: { $gte: weekStart, $lte: weekEnd }
					},
					{ projection: { date: 1, hour: 1 } }
				)
				.toArray();
			bookedSlotKeys = rows.map((r) => `${r.date}_${Number(r.hour)}`);
		}

		return {
			configured: true,
			objects,
			selectedObjectId,
			weekStart: monday,
			isoWeek: isoWeekNumber(monday),
			isoWeekYear: isoWeekYear(monday),
			dayDates,
			bookedSlotKeys
		};
	} catch (e) {
		return {
			configured: true,
			error: e instanceof Error ? e.message : String(e),
			objects: [],
			selectedObjectId: null,
			weekStart: monday,
			isoWeek: 0,
			isoWeekYear: 0,
			dayDates,
			bookedSlotKeys: []
		};
	}
}

export async function createSlotBooking(input: {
	objectId: string;
	date: string;
	hour: number;
	guestName: string;
	guestEmail: string;
	guestPhone: string;
	label: string;
	/** Snapshot of object price at booking time (SEK). */
	bookingPrice: number;
	/** MSS payment request token/UUID after HTTP 201 (paid bookings only). */
	swishPaymentRequestUuid?: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
	const db = await getDb();
	if (!db) return { ok: false, message: 'Databasen är inte konfigurerad.' };

	const hour = Number(input.hour);
	if (!Number.isInteger(hour) || hour < FIRST_HOUR || hour > LAST_START_HOUR) {
		return { ok: false, message: 'Ogiltig tid.' };
	}
	if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
		return { ok: false, message: 'Ogiltigt datum.' };
	}

	const id = slotRowId(input.objectId, input.date, hour);
	const price = Number(input.bookingPrice);
	const bookingPrice = Number.isFinite(price) ? Math.round(price * 100) / 100 : 0;
	const swishUuid =
		typeof input.swishPaymentRequestUuid === 'string' && input.swishPaymentRequestUuid.trim()
			? input.swishPaymentRequestUuid.trim().slice(0, 64)
			: null;
	try {
		await db.collection<BookingDocument>('bookings').insertOne({
			_id: id,
			object_id: input.objectId,
			date: input.date,
			hour,
			guest_name: input.guestName,
			guest_email: input.guestEmail,
			guest_phone: input.guestPhone,
			label: input.label,
			booking_price: bookingPrice,
			swish_payment_request_uuid: swishUuid,
			created_at: new Date()
		});
		return { ok: true };
	} catch (e: unknown) {
		if (isDuplicateKey(e)) {
			return { ok: false, message: 'Tiden är redan bokad.' };
		}
		return { ok: false, message: e instanceof Error ? e.message : String(e) };
	}
}
