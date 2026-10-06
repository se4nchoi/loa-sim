import { loadCharacter } from '$lib/server/bible';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const REGIONS = new Set(['NA', 'CE']);

export const load: PageServerLoad = async ({ params, fetch }) => {
	const region = params.region.toUpperCase();
	if (!REGIONS.has(region)) error(404, 'Unknown region');
	try {
		return await loadCharacter(region, params.name, fetch);
	} catch (e) {
		error(502, e instanceof Error ? e.message : 'Could not load character');
	}
};
