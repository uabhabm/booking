import type { RowDataPacket } from 'mysql2';
import { isoWeekNumber, isoWeekYear, weekDayDates } from '$lib/calendar';
import { getPool } from './db';

/** Fallback when `bookable_objects.total_to_pay_label` is missing or blank. */
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

export async function isSlotBooked(objectId: string, date: string, hour: number): Promise<boolean> {
	const pool = getPool();
	if (!pool) return true;
	const id = slotRowId(objectId, date, hour);
	const [rows] = await pool.query<RowDataPacket[]>(
		'SELECT 1 AS ok FROM bookings WHERE id = ? LIMIT 1',
		[id]
	);
	return (rows as { ok: number }[]).length > 0;
}

function isDuplicateKey(e: unknown): boolean {
	const err = e as { code?: string; errno?: number };
	return err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062;
}

function rowToBookableObject(r: {
	id: string;
	name: string;
	booking_price?: unknown;
	total_to_pay_label?: string | null;
}): BookableObject {
	const raw = r.booking_price;
	const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? '0'));
	const label = String(r.total_to_pay_label ?? '').trim();
	return {
		id: r.id,
		name: String(r.name ?? r.id),
		bookingPrice: Number.isFinite(n) ? n : 0,
		totalToPayLabel: label || DEFAULT_TOTAL_TO_PAY_LABEL
	};
}

export async function getBookableObject(id: string): Promise<BookableObject | null> {
	const pool = getPool();
	if (!pool) return null;
	const [rows] = await pool.query<RowDataPacket[]>(
		'SELECT id, name, booking_price, total_to_pay_label FROM bookable_objects WHERE id = ? LIMIT 1',
		[id]
	);
	const list = rows as {
		id: string;
		name: string;
		booking_price?: unknown;
		total_to_pay_label?: string | null;
	}[];
	return list[0] ? rowToBookableObject(list[0]) : null;
}

export async function listBookableObjects(): Promise<BookableObject[]> {
	const pool = getPool();
	if (!pool) return [];
	const [rows] = await pool.query<RowDataPacket[]>(
		'SELECT id, name, booking_price, total_to_pay_label FROM bookable_objects ORDER BY name ASC'
	);
	return (
		rows as {
			id: string;
			name: string;
			booking_price?: unknown;
			total_to_pay_label?: string | null;
		}[]
	).map(rowToBookableObject);
}

export async function loadBookingPage(params: {
	weekStart: string;
	objectId: string | null;
	/** `exact`: unknown id does not fall back to the first object (for `/[objectId]` routes). */
	objectSelection?: 'default' | 'exact';
}): Promise<PageLoadResult> {
	const pool = getPool();
	const monday = params.weekStart;
	const dayDates = weekDayDates(monday);

	if (!pool) {
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
			const [rows] = await pool.query<RowDataPacket[]>(
				'SELECT `date`, hour FROM bookings WHERE object_id = ? AND `date` >= ? AND `date` <= ?',
				[selectedObjectId, weekStart, weekEnd]
			);
			bookedSlotKeys = (rows as { date: string; hour: number }[]).map(
				(r) => `${r.date}_${Number(r.hour)}`
			);
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
	/** Snapshot from `bookable_objects.booking_price` at booking time (SEK). */
	bookingPrice: number;
	/** MSS payment request token/UUID after HTTP 201 (paid bookings only). */
	swishPaymentRequestUuid?: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
	const pool = getPool();
	if (!pool) return { ok: false, message: 'Databasen är inte konfigurerad.' };

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
		await pool.execute(
			'INSERT INTO bookings (id, object_id, `date`, hour, guest_name, guest_email, guest_phone, label, booking_price, swish_payment_request_uuid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
			[
				id,
				input.objectId,
				input.date,
				hour,
				input.guestName,
				input.guestEmail,
				input.guestPhone,
				input.label,
				bookingPrice,
				swishUuid
			]
		);
		return { ok: true };
	} catch (e: unknown) {
		if (isDuplicateKey(e)) {
			return { ok: false, message: 'Tiden är redan bokad.' };
		}
		return { ok: false, message: e instanceof Error ? e.message : String(e) };
	}
}
