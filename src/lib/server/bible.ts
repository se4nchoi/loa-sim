// Server-side loader, off by default. lostark.bible's robots.txt disallows automated access, so a public
// deployment must not proxy its data; players paste it themselves instead (see /load). Enable with
// BIBLE_SERVER_FETCH=1 for local development, or if the site owner permits it. It fetches one character
// per request, caches it, and never crawls.

import { env } from '$env/dynamic/private';
import { decodeCharacterData, bibleDataUrl, type CharacterData } from '$lib/bible-data';

const TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; data: CharacterData }>();

export const serverFetchEnabled = () => env.BIBLE_SERVER_FETCH === '1';

export async function loadCharacter(region: string, name: string, fetchFn: typeof fetch): Promise<CharacterData> {
	const key = `${region}/${name}`.toLowerCase();
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

	const res = await fetchFn(bibleDataUrl(region, name), {
		headers: { 'user-agent': 'loa-eff combat power simulator (single lookups)' }
	});
	if (!res.ok) throw new Error(`lostark.bible returned ${res.status}`);
	const data = decodeCharacterData(await res.json(), name, region);
	cache.set(key, { at: Date.now(), data });
	return data;
}
