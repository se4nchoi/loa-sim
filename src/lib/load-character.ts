// Loads a character's current lostark.bible snapshot through our server (bible's data has no CORS) and keeps it in
// this browser. One character per player action.

import type { CharacterData } from '$lib/bible-data';
import { saveRegion } from '$lib/region-preference';
import { saveCharacter } from '$lib/saved-character';
import { track, trackCharacterLoad } from '$lib/stats';

export async function loadCharacter(region: string, name: string): Promise<CharacterData> {
	const res = await fetch(`/api/character/${encodeURIComponent(region)}/${encodeURIComponent(name)}`).catch((e) => {
		track({ event: 'lookup_fail', region });
		throw e;
	});
	const body = await res.json().catch(() => null);
	if (!res.ok || !body?.loadout) track({ event: 'lookup_fail', region });
	if (!res.ok) throw new Error(body?.message ?? `Loading failed (${res.status})`);
	if (!body?.loadout) throw new Error(`${name} (${region}) wasn't found on lostark.bible, or has no Ark Passive loadout with Combat Power yet.`);
	trackCharacterLoad({ ...body, region: body.region ?? region, name: body.name ?? name }, 'remote');
	saveCharacter(body);
	saveRegion(region);
	return body;
}
