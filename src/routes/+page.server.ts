import { redirect } from '@sveltejs/kit';
import { listBookableObjects } from '$lib/server/booking-data';
import { isDatabaseConfigured } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const objectId = url.searchParams.get('objectId');
	const vecka = url.searchParams.get('vecka');
	if (objectId) {
		const p = new URLSearchParams();
		if (vecka) p.set('vecka', vecka);
		const q = p.toString();
		redirect(303, `/${encodeURIComponent(objectId)}${q ? `?${q}` : ''}`);
	}

	const configured = isDatabaseConfigured();
	if (!configured) {
		return { configured: false as const, objects: [] as { id: string; name: string }[] };
	}
	try {
		const objects = await listBookableObjects();
		return { configured: true as const, objects };
	} catch (e) {
		return {
			configured: true as const,
			objects: [] as { id: string; name: string }[],
			error: e instanceof Error ? e.message : String(e)
		};
	}
};
