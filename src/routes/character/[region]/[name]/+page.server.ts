import { REGIONS, normalizeName, type CharacterData } from '$lib/bible-data';
import { loadCharacter, serverFetchEnabled } from '$lib/server/bible';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, fetch }) => {
	const region = params.region.toUpperCase();
	if (!(REGIONS as readonly string[]).includes(region)) error(404, 'Unknown region');
	// With server fetching turned off, send the player to the paste flow instead.
	if (!serverFetchEnabled()) redirect(307, `/?region=${region}&name=${encodeURIComponent(params.name)}`);
	const name = normalizeName(params.name);
	// Not awaited: the page is sent right away with a placeholder, and the character streams in when lostark.bible
	// answers. A failure resolves to its message (a rejected streamed promise would go unhandled on the server).
	const character: Promise<{ data: CharacterData } | { error: string }> = loadCharacter(region, name, fetch).then(
		(data) => ({ data }),
		(e) => ({ error: e instanceof Error ? e.message : 'Could not load character' })
	);
	return { region, name, character };
};
