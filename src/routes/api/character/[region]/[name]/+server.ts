// One character's lostark.bible data as JSON, for the "Load" buttons (browsers can't fetch bible's data directly).
import { REGIONS, normalizeName } from '$lib/bible-data';
import { CHARACTER_CACHE_SECONDS, loadCharacter, serverFetchEnabled } from '$lib/server/bible';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, fetch, setHeaders }) => {
	const region = params.region.toUpperCase();
	if (!(REGIONS as readonly string[]).includes(region)) error(404, 'Unknown region');
	if (!serverFetchEnabled()) error(503, 'Loading from lostark.bible is turned off; paste your data instead.');
	try {
		const data = await loadCharacter(region, normalizeName(params.name), fetch);
		// Revalidate browser loads; share a short CDN copy to avoid repeated upstream requests.
		setHeaders({ 'cache-control': `public, max-age=0, s-maxage=${CHARACTER_CACHE_SECONDS}` });
		return json(data);
	} catch (e) {
		error(502, e instanceof Error ? e.message : 'Could not load the character');
	}
};
