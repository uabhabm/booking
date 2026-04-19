import { error } from '@sveltejs/kit';
import {
	addDaysYMD,
	isoWeekNumber,
	mondayOfWeekContaining,
	todayYMDStockholm
} from '$lib/calendar';
import { HOUR_SLOTS, loadBookingPage } from '$lib/server/booking-data';
import type { PageServerLoad } from './$types';

function buildWeekPickerOptions(centerMonday: string): { monday: string; label: string }[] {
	return Array.from({ length: 25 }, (_, i) => i - 8).map((offset) => {
		const monday = addDaysYMD(centerMonday, offset * 7);
		return { monday, label: `Vecka ${isoWeekNumber(monday)}` };
	});
}

export const load: PageServerLoad = async ({ url, params }) => {
	const vecka = url.searchParams.get('vecka');
	const today = todayYMDStockholm();
	const weekStart = vecka ? mondayOfWeekContaining(vecka) : mondayOfWeekContaining(today);

	const page = await loadBookingPage({
		weekStart,
		objectId: params.objectId,
		objectSelection: 'exact'
	});

	if (page.configured && page.objects.length > 0 && !page.selectedObjectId) {
		error(404, 'Bokningsobjektet finns inte.');
	}

	return {
		...page,
		hours: [...HOUR_SLOTS],
		prevMonday: addDaysYMD(weekStart, -7),
		nextMonday: addDaysYMD(weekStart, 7),
		weekOptions: buildWeekPickerOptions(weekStart)
	};
};
