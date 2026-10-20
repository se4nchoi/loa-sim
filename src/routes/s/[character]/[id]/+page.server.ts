import { error } from '@sveltejs/kit';
import { getSharedSimulation, redisConfig } from '$lib/server/shared-simulations';
import { count, isBot } from '$lib/server/stats';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({params,fetch,setHeaders,request}) => {
	setHeaders({'cache-control':'private, no-store', 'x-robots-tag':'noindex, nofollow'});
	if (!redisConfig()) error(503, 'Shared simulations are temporarily unavailable. Please try again later.');
	let shared;
	try { shared = await getSharedSimulation(params.id, params.character, fetch); }
	catch { error(503, 'Could not load this shared simulation. Please try again later.'); }
	if (!shared) error(410, 'This link has expired or could not be found. Shared links last 30 days. Ask the sender for a new link.');
	if (!isBot(request.headers.get('user-agent'))) await count({event:'share_opened'}, fetch);
	return {shared};
};
