import { dev } from '$app/environment';
import { resolveClass } from '$lib/upgrade-planner/class-names';
import type { CharacterData } from '$lib/bible-data';
import type { CountEvent } from './stats-model';
import { createStatsQueue } from './stats-transport';
import { lookupLevel, powerBucket, visitCharacters, visitUpgrades } from './fun-stats';

const sent = new Set<string>();
let queue: ReturnType<typeof createStatsQueue> | undefined;
/** This page visit only, kept in memory: how many upgrades were applied and how many characters were loaded. */
const visit = { upgrades: 0, characters: new Set<string>(), active: false, reported: false };

/** One summary per page visit, sent the first time the tab is hidden (closing, switching tabs or apps). */
function reportVisit() {
	if (!visit.active || visit.reported) return;
	visit.reported = true;
	queue?.enqueue({ event: 'visit_end', upgrades: visitUpgrades(visit.upgrades), characters: visitCharacters(visit.characters.size) });
}

export function track(e: Omit<CountEvent, 'id'>, once?: string) {
	if (dev || typeof window === 'undefined') return;
	if (once && sent.has(once)) return;
	if (once) sent.add(once);
	if (!queue) {
		queue = createStatsQueue(fetch);
		document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { reportVisit(); void queue?.flush(); } });
	}
	if (e.event === 'upgrade_applied') visit.upgrades++;
	if (e.event === 'lookup' || e.event === 'sim_open' || e.event === 'upgrade_applied') visit.active = true;
	queue.enqueue(e);
}

export function trackCharacterLoad(data: CharacterData, source: 'remote' | 'paste') {
	const cls = [data.loadout?.classId, data.loadouts?.current?.classId, data.loadouts?.estimated?.classId, data.header?.class]
		.map(resolveClass).find(Boolean) ?? data.loadout?.classId ?? data.header?.class;
	if (data.region && data.name) visit.characters.add(`${data.region}/${data.name}`.toLowerCase());
	const level = lookupLevel(data.header?.ilvl), power = powerBucket(data.loadout?.combatPower?.score);
	const role = data.loadout?.battlePoint ? (data.loadout.battlePoint.isSupport ? 'support' : 'dealer') : undefined;
	track({ event: 'lookup', region: data.region, name: data.name, class: cls, source,
		...(level ? { level } : {}), ...(power && role ? { power, role } : {}) });
}
