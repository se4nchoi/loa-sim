// Loads a character's current lostark.bible snapshot through our server (bible's data has no CORS) and keeps it in
// this browser. One character per player action.

import type { CharacterData } from '$lib/bible-data';
import { saveRegion } from '$lib/region-preference';
import { saveCharacter } from '$lib/saved-character';

export async function loadCharacter(region: string, name: string): Promise<CharacterData> {
	const res = await fetch(`/api/character/${encodeURIComponent(region)}/${encodeURIComponent(name)}`);
	const body = await res.json().catch(() => null);
	if (!res.ok) throw new Error(body?.message ?? `Loading failed (${res.status})`);
	if (!body?.loadout) throw new Error(`${name} (${region}) wasn't found on lostark.bible, or has no Ark Passive loadout with Combat Power yet.`);
	saveCharacter(body);
	saveRegion(region);
	return body;
}
