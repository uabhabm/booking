/** Format amount as Swedish kronor (e.g. "199,00 kr"). */
export function formatSek(amount: number): string {
	return new Intl.NumberFormat('sv-SE', {
		style: 'currency',
		currency: 'SEK',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).format(amount);
}

/** Label for sidebar / receipts: free vs formatted price. */
export function totalPriceLabel(bookingPrice: number): string {
	if (bookingPrice <= 0) return 'Kostnadsfritt';
	return formatSek(bookingPrice);
}
