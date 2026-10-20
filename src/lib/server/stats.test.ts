import {beforeEach, describe, expect, it, vi} from 'vitest';

const env: Record<string,string> = {};
vi.mock('$env/dynamic/private', () => ({env}));
const {cleanEvent, count, isBot, readStats} = await import('./stats');

// A tiny Redis: hashes and "HyperLogLogs" as exact sets, behind Upstash's /pipeline endpoint.
function fakeRedis() {
	const hashes = new Map<string, Map<string, number>>();
	const sets = new Map<string, Set<string>>();
	const urls: string[] = [];
	const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
		urls.push(String(url));
		const cmds = JSON.parse(String(init?.body)) as string[][];
		return new Response(JSON.stringify(cmds.map(([op, key, ...rest]) => {
			if (op === 'HINCRBY') { const h = hashes.get(key) ?? new Map(); hashes.set(key, h); h.set(rest[0], (h.get(rest[0]) ?? 0) + Number(rest[1])); return {result: h.get(rest[0])}; }
			if (op === 'PFADD') { const s = sets.get(key) ?? new Set(); sets.set(key, s); rest.forEach((v) => s.add(v)); return {result: 1}; }
			if (op === 'HGETALL') return {result: [...(hashes.get(key) ?? [])].flatMap(([f, v]) => [f, String(v)])};
			if (op === 'PFCOUNT') return {result: new Set([key, ...rest].flatMap((k) => [...(sets.get(k) ?? [])])).size};
			return {error: 'unknown'};
		})));
	}) as unknown as typeof fetch;
	return {hashes, sets, urls, fetchFn};
}
const day1 = Date.parse('2026-10-21T12:00:00Z'), day2 = Date.parse('2026-10-22T12:00:00Z');
beforeEach(() => { for (const key of Object.keys(env)) delete env[key]; env.STORAGE_KV_REST_API_URL = 'https://redis.example'; env.STORAGE_KV_REST_API_TOKEN = 'secret'; });

describe('usage stats', () => {
	it('accepts only known browser events with valid fields', () => {
		expect(cleanEvent({event: 'lookup', region: 'na', name: 'Soulshan', class: 'souleater'})).toEqual({event: 'lookup', region: 'NA', name: 'Soulshan', class: 'souleater'});
		expect(cleanEvent({event: 'sim_open', region: 'XX'})).toEqual({event: 'sim_open'});
		expect(cleanEvent({event: 'share_created'})).toBeNull();
		expect(cleanEvent({event: 'anything'})).toBeNull();
		expect(cleanEvent({event: 'lookup', region: 'KR', name: 'A'})).toBeNull();
		expect(cleanEvent({event: 'lookup', region: 'NA', name: 'a/b'})).toBeNull();
		expect(cleanEvent(null)).toBeNull();
	});

	it('counts per day by event, region and class, and distinct characters without storing names', async () => {
		const db = fakeRedis();
		await count({event: 'lookup', region: 'NA', name: 'Soulshan', class: 'souleater'}, db.fetchFn, day1);
		await count({event: 'lookup', region: 'NA', name: 'soulshan', class: 'made_up'}, db.fetchFn, day1);
		await count({event: 'lookup', region: 'CE', name: 'Other', class: 'bard'}, db.fetchFn, day2);
		await count({event: 'share_created'}, db.fetchFn, day2);
		expect(db.urls[0]).toBe('https://redis.example/pipeline');
		expect(Object.fromEntries(db.hashes.get('loa-sim:stats:2026-10-21')!)).toEqual({lookup: 2, 'lookup:NA': 2, 'class:Souleater': 1, 'class:Other': 1});
		expect(db.sets.get('loa-sim:stats:characters:2026-10-21')!.size).toBe(1);
		expect([...db.sets.values()].flatMap((s) => [...s]).join()).not.toMatch(/soulshan/i);

		const report = await readStats(30, db.fetchFn, day2);
		expect(report.from).toBe('2026-10-20');
		expect(report.to).toBe('2026-10-22');
		expect(report.distinctCharacters).toBe(2);
		expect(report.totals).toEqual({'class:Bard': 1, 'class:Other': 1, 'class:Souleater': 1, lookup: 3, 'lookup:CE': 1, 'lookup:NA': 2, share_created: 1});
		expect(report.days.map((d) => [d.date, d.distinctCharacters])).toEqual([['2026-10-22', 1], ['2026-10-21', 1], ['2026-10-20', 0]]);
	});

	it('never fails the caller when storage is missing or down', async () => {
		const down = vi.fn(async () => new Response('', {status: 500})) as unknown as typeof fetch;
		await expect(count({event: 'sim_open'}, down)).resolves.toBeUndefined();
		delete env.STORAGE_KV_REST_API_URL;
		await count({event: 'sim_open'}, down);
		expect(down).toHaveBeenCalledTimes(1);
	});

	it('recognises link-preview bots', () => {
		expect(isBot('Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)')).toBe(true);
		expect(isBot(null)).toBe(true);
		expect(isBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36')).toBe(false);
	});
});
