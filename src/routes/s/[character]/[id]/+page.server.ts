import { error } from '@sveltejs/kit';
import { getSharedSimulation, sharingConfigured } from '$lib/server/shared-simulations';
import { statsDb } from '$lib/server/d1';
import { count, isBot } from '$lib/server/stats';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({params,fetch,platform,setHeaders,request}) => {
	setHeaders({'cache-control':'private, no-store', 'x-robots-tag':'noindex, nofollow'});
	if (!sharingConfigured()) error(503, 'Shared simulations are temporarily unavailable. Please try again later.');
	let shared;
	try { shared = await getSharedSimulation(params.id, params.character, fetch); }
	catch { error(503, 'Could not load this shared simulation. Please try again later.'); }
	if (!shared) error(410, 'This link has expired or could not be found. Shared links last 30 days. Ask the sender for a new link.');
	if (!isBot(request.headers.get('user-agent'))) await count({event:'share_opened'}, statsDb(platform));
	return {shared};
};
