import { dev } from '$app/environment';
import { resolveClass } from '$lib/upgrade-planner/class-names';
import type { CharacterData } from '$lib/bible-data';
import type { CountEvent } from './stats-model';
import { createStatsQueue } from './stats-transport';

const sent = new Set<string>();
let queue: ReturnType<typeof createStatsQueue> | undefined;

export function track(e: Omit<CountEvent, 'id'>, once?: string) {
	if (dev || typeof window === 'undefined') return;
	if (once && sent.has(once)) return;
	if (once) sent.add(once);
	if (!queue) {
		queue = createStatsQueue(fetch);
		document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void queue?.flush(); });
	}
	queue.enqueue(e);
}

export function trackCharacterLoad(data: CharacterData, source: 'remote' | 'paste') {
	const cls = [data.loadout?.classId, data.loadouts?.current?.classId, data.loadouts?.estimated?.classId, data.header?.class]
		.map(resolveClass).find(Boolean) ?? data.loadout?.classId ?? data.header?.class;
	track({ event: 'lookup', region: data.region, name: data.name, class: cls, source });
}
