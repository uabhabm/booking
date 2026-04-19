/** Calendar helpers using Europe/Stockholm for “today” and plain YYYY-MM-DD for storage. */

export function todayYMDStockholm(): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Europe/Stockholm',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date());
}

/** Parse YYYY-MM-DD as a noontime UTC anchor (stable weekday for that civil date). */
export function parseYMD(ymd: string): Date {
	const [y, m, d] = ymd.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

export function addDaysYMD(ymd: string, days: number): string {
	const dt = parseYMD(ymd);
	dt.setUTCDate(dt.getUTCDate() + days);
	return toYMD(dt);
}

export function toYMD(d: Date): string {
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, '0');
	const day = String(d.getUTCDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

/** Monday 00:00.. of the ISO week that contains `ymd` (civil date). */
export function mondayOfWeekContaining(ymd: string): string {
	const d = parseYMD(ymd);
	const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
	const offset = (dow + 6) % 7; // Mon -> 0, Sun -> 6
	d.setUTCDate(d.getUTCDate() - offset);
	return toYMD(d);
}

export function weekDayDates(mondayYmd: string): string[] {
	return Array.from({ length: 7 }, (_, i) => addDaysYMD(mondayYmd, i));
}

/** ISO week number for the civil week that contains `mondayYmd` (Monday). */
export function isoWeekNumber(mondayYmd: string): number {
	let date = parseYMD(mondayYmd);
	date = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
	date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
	const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
	const dayDiff = (date.getTime() - yearStart.getTime()) / 86400000;
	return Math.ceil((dayDiff + 1) / 7);
}

/** ISO week-year for that week. */
export function isoWeekYear(mondayYmd: string): number {
	let date = parseYMD(mondayYmd);
	date = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
	date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
	return date.getUTCFullYear();
}

const SW_MONTHS = [
	'jan',
	'feb',
	'mar',
	'apr',
	'maj',
	'jun',
	'jul',
	'aug',
	'sep',
	'okt',
	'nov',
	'dec'
] as const;
const SW_DAYS = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'] as const;

/** Column header like "Mån 13 apr" */
export function formatDayHeader(ymd: string): { weekday: string; rest: string } {
	const d = parseYMD(ymd);
	const wd = SW_DAYS[d.getUTCDay()];
	const day = d.getUTCDate();
	const mon = SW_MONTHS[d.getUTCMonth()];
	return { weekday: wd, rest: `${day} ${mon}` };
}

/** Sidebar style, e.g. "Torsdag, 16 april" (Stockholm civil date). */
export function formatLongSwedishBookingDate(ymd: string): string {
	const d = parseYMD(ymd);
	const parts = new Intl.DateTimeFormat('sv-SE', {
		timeZone: 'Europe/Stockholm',
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	}).formatToParts(d);
	const get = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((p) => p.type === type)?.value ?? '';
	const wd = get('weekday');
	const day = get('day');
	const month = get('month');
	const cap = (s: string) => (s ? s.charAt(0).toLocaleUpperCase('sv-SE') + s.slice(1) : '');
	return `${cap(wd)}, ${day} ${month}`;
}
