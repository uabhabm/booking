/** Stored when the user leaves a field empty on submit; shown in red only after submit for those fields. */
export const bookingFieldDefaults = {
	guestName: 'Ej angivet',
	guestEmail: 'Ej angiven e-post',
	guestPhone: 'Ej angivet telefonnummer',
	label: 'Inget meddelande'
} as const;

export type BookingFieldKey = keyof typeof bookingFieldDefaults;

/** Form field names used when reporting which defaults were applied after submit. */
export const BOOKING_FORM_FIELD_KEYS = ['guestName', 'guestEmail', 'guestPhone', 'label'] as const;
export type BookingFormFieldKey = (typeof BOOKING_FORM_FIELD_KEYS)[number];

export function valueOrDefault(raw: FormDataEntryValue | null | undefined, fallback: string): string {
	if (typeof raw !== 'string') return fallback;
	const t = raw.trim();
	return t || fallback;
}

export function isFieldEmpty(raw: FormDataEntryValue | null | undefined): boolean {
	if (typeof raw !== 'string') return true;
	return !raw.trim();
}
