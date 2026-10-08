import { REGIONS } from '$lib/bible-data';
import { loadCharacter, serverFetchEnabled } from '$lib/server/bible';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, fetch }) => {
	const region = params.region.toUpperCase();
	if (!(REGIONS as readonly string[]).includes(region)) error(404, 'Unknown region');
	// With server fetching turned off, send the player to the paste flow instead.
	if (!serverFetchEnabled()) redirect(307, `/?region=${region}&name=${encodeURIComponent(params.name)}`);
	try {
		return await loadCharacter(region, params.name, fetch);
	} catch (e) {
		error(502, e instanceof Error ? e.message : 'Could not load character');
	}
};
