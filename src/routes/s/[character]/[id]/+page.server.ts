import { error } from '@sveltejs/kit';
import { getSharedSimulation, redisConfig } from '$lib/server/shared-simulations';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({params,fetch,setHeaders}) => {
	setHeaders({'cache-control':'private, no-store', 'x-robots-tag':'noindex, nofollow'});
	if (!redisConfig()) error(503, 'Shared simulations are temporarily unavailable. Please try again later.');
	let shared;
	try { shared = await getSharedSimulation(params.id, params.character, fetch); }
	catch { error(503, 'Could not load this shared simulation. Please try again later.'); }
	if (!shared) error(410, 'This link has expired or could not be found. Shared links last 30 days. Ask the sender for a new link.');
	return {shared};
};
