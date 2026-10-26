import {beforeEach, describe, expect, it, vi} from 'vitest';

const env: Record<string,string> = {};
vi.mock('$env/dynamic/private', () => ({env}));
const {cleanEvent, count, record, isBot, readStats} = await import('./stats');
const {budgetSample,insightCohort}=await import('$lib/stats-insights');
const {CP_STATS_MODEL}=await import('$lib/stats-versions');
const {samplingAttempt}=await import('$lib/stats-sampling');

// A tiny Redis: hashes and "HyperLogLogs" as exact sets, behind Upstash's /pipeline endpoint.
function fakeRedis() {
	const hashes = new Map<string, Map<string, number>>();
	const sets = new Map<string, Set<string>>();
	const urls: string[] = [];
	const strings = new Map<string, string>();
	const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
		urls.push(String(url));
		const parsed = JSON.parse(String(init?.body));
		if (parsed[0] === 'EVAL') {
			const [, , , key, chars, receipt, rate, since, id, character, fieldsJson, started, limited] = parsed;
			if (id && strings.has(receipt)) return Response.json({ result: 0 });
			if (limited === 'limited') {
				const n = Number(strings.get(rate) ?? 0) + 1;
				strings.set(rate, String(n));
				if (n > 120) return Response.json({ result: -1 });
			}
			const h = hashes.get(key) ?? new Map<string, number>();
			hashes.set(key, h);
			for (const field of JSON.parse(fieldsJson)) h.set(field, (h.get(field) ?? 0) + 1);
			if (character) { const s = sets.get(chars) ?? new Set<string>(); sets.set(chars, s); s.add(character); }
			if (id) strings.set(receipt, '1');
			if (started && !strings.has(since)) strings.set(since, started);
			return Response.json({ result: 1 });
		}
		const cmds = parsed as string[][];
		return new Response(JSON.stringify(cmds.map(([op, key, ...rest]) => {
			if (op === 'HINCRBY') { const h = hashes.get(key) ?? new Map(); hashes.set(key, h); h.set(rest[0], (h.get(rest[0]) ?? 0) + Number(rest[1])); return {result: h.get(rest[0])}; }
			if (op === 'PFADD') { const s = sets.get(key) ?? new Set(); sets.set(key, s); rest.forEach((v) => s.add(v)); return {result: 1}; }
			if (op === 'HGETALL') return {result: [...(hashes.get(key) ?? [])].flatMap(([f, v]) => [f, String(v)])};
			if (op === 'PFCOUNT') return {result: new Set([key, ...rest].flatMap((k) => [...(sets.get(k) ?? [])])).size};
			if (op === 'GET') return {result: strings.get(key) ?? null};
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
		expect(db.urls[0]).toBe('https://redis.example');
		expect(Object.fromEntries(db.hashes.get('loa-sim:stats:2026-10-21')!)).toEqual({lookup: 2, 'lookup:NA': 2, 'class:Souleater': 1, 'class:Unknown': 1, 'unknown:unrecognized': 1});
		expect(db.sets.get('loa-sim:stats:characters:2026-10-21')!.size).toBe(1);
		expect([...db.sets.values()].flatMap((s) => [...s]).join()).not.toMatch(/soulshan/i);

		const report = await readStats(30, db.fetchFn, day2);
		expect(report.from).toBe('2026-10-20');
		expect(report.to).toBe('2026-10-22');
		expect(report.distinctCharacters).toBe(2);
		expect(report.totals).toEqual({'class:Bard': 1, 'class:Unknown': 1, 'unknown:unrecognized': 1, 'class:Souleater': 1, lookup: 3, 'lookup:CE': 1, 'lookup:NA': 2, share_created: 1});
		expect(report.days.map((d) => [d.date, d.distinctCharacters])).toEqual([['2026-10-22', 1], ['2026-10-21', 1], ['2026-10-20', 0]]);
	});

	it('does not count retried IDs again, including across UTC midnight', async () => {
		const db = fakeRedis();
		const event = {event: 'budget_opened', id: crypto.randomUUID()} as const;
		await record(event, db.fetchFn, day1);
		await record(event, db.fetchFn, day2);
		const report = await readStats(7, db.fetchFn, day2);
		expect(report.totals.budget_opened).toBe(1);
		expect(report.explorationSince).toBe('2026-10-21');
	});

	it('recognizes display names and records missing metadata separately from unrecognized metadata', async () => {
		const db = fakeRedis();
		await record({ event: 'lookup', region: 'NA', name: 'A', class: 'Soul Eater', source: 'paste' }, db.fetchFn, day1);
		await record({ event: 'lookup', region: 'NA', name: 'B' }, db.fetchFn, day1);
		const report = await readStats(7, db.fetchFn, day1);
		expect(report.totals).toMatchObject({'class:Souleater': 1, 'class:Unknown': 1, 'unknown:missing': 1, 'source:paste': 1});
	});

	it('rejects fabricated categories and invalid IDs before writing', () => {
		expect(cleanEvent({ event: 'upgrade_applied', category: 'username' })).toBeNull();
		expect(cleanEvent({ event: 'budget_opened', id: 'a'.repeat(36) })).toBeNull();
		expect(cleanEvent({ event: 'upgrade_applied', category: 'quality', id: crypto.randomUUID() })).toMatchObject({ category: 'quality' });
	});
	it('validates saved-plan samples and rejects raw or malformed properties', async () => {
		const plan = {cp:'10to20',target:'1790to1819',role:'dealer'} as const;
		expect(cleanEvent({event:'build_saved',plan})).toMatchObject({plan});
		expect(cleanEvent({event:'build_saved',plan:{...plan,gear:'private'}})).toBeNull();
		expect(cleanEvent({event:'build_saved',plan:{...plan,role:{toString:'invalid'}}})).toBeNull();
		expect(cleanEvent({event:'sim_open',plan})).toBeNull();
		const db = fakeRedis();
		await record({event:'build_saved',plan},db.fetchFn,day1);
		expect((await readStats(7,db.fetchFn,day1)).totals).toMatchObject({'plan:count':1,'plan:cp:10to20':1,'plan:level:1790to1819':1,'plan:role:dealer':1});
	});
	it('requires v2 receipts for rich samples and keeps cohort relationships in the daily counters',async()=>{
		const insight=budgetSample(insightCohort('souleater','NA/Soulshan',1784,false)!,[{key:'x',title:'x',detail:'',section:'Equipment',missing:[],average:200000}],100,105)!;
		const event={event:'budget_sampled',v:2,id:crypto.randomUUID(),insight} as const;
		expect(cleanEvent(event)).toEqual(event);
		expect(cleanEvent({...event,v:undefined})).toBeNull();
		expect(cleanEvent({...event,event:'sim_open'})).toBeNull();
		const db=fakeRedis();await record(event,db.fetchFn,day1);await record(event,db.fetchFn,day1);
		const report=await readStats(7,db.fetchFn,day1);
		expect(report.totals).toMatchObject({budget_sampled:1,'budget:coverage:complete':1,'budget:cost:100to500k':1});
		expect(Object.keys(report.totals)).toContain(`budget:curve:${CP_STATS_MODEL}:NA:souleater:dealer:1760to1789:100to500k:5to10:na:standard`);
	});

	it('strict ingestion surfaces outages, while product actions remain best effort', async () => {
		const down = vi.fn(async () => new Response(null, {status: 500})) as unknown as typeof fetch;
		await expect(record({event: 'sim_open'}, down)).rejects.toThrow();
		await expect(count({event: 'sim_open'}, down)).resolves.toBeUndefined();
	});
	it('atomically counts an applied choice or its exclusion, including retries across midnight',async()=>{
		const {decisionSample}=await import('$lib/stats-insights');
		const upgrade={key:'gem',category:'gem',gainPct:2,title:'private',detail:'private',count:1,approximate:false} as const;
		const insight=decisionSample(insightCohort('souleater','NA/A',1780,false)!,upgrade,'gold',[upgrade],{gem:100000},{},{})!;
		const event={event:'upgrade_applied',category:'gem',v:3,id:crypto.randomUUID(),insight,sampling:samplingAttempt('decision')} as const;
		expect(cleanEvent(event)).toEqual(event);
		const db=fakeRedis();
		await record(cleanEvent(event)!,db.fetchFn,day1);await record(cleanEvent(event)!,db.fetchFn,day2);
		const skipped={...event,id:crypto.randomUUID(),insight:undefined,sampling:samplingAttempt('decision','baseline-mismatch')};
		expect(cleanEvent(skipped)).toEqual(skipped);
		await record(cleanEvent(skipped)!,db.fetchFn,day2);
		const counts=(await readStats(7,db.fetchFn,day2)).totals;
		expect(counts).toMatchObject({upgrade_applied:2,'upgrade:gem':2,decision_sampled:1,
			[`sampling:attempt:${CP_STATS_MODEL}:decision`]:2,
			[`sampling:outcome:${CP_STATS_MODEL}:decision:sampled`]:1,
			[`sampling:outcome:${CP_STATS_MODEL}:decision:baseline-mismatch`]:1});
		expect(Object.keys(counts).some(k=>k.includes('private'))).toBe(false);
	});
	it('records closed and unmounted budgets separately without inventing completed samples',async()=>{
		const insight=budgetSample(insightCohort('bard','CE/A',1780,true)!,[],100,100)!;
		const closed={event:'budget_closed',v:3,id:crypto.randomUUID(),insight,sampling:samplingAttempt('budget')} as const;
		const abandoned={event:'budget_abandoned',v:3,id:crypto.randomUUID(),sampling:samplingAttempt('budget','unmounted')} as const;
		expect(cleanEvent(closed)).toEqual(closed);expect(cleanEvent(abandoned)).toEqual(abandoned);
		const db=fakeRedis();await record(cleanEvent(closed)!,db.fetchFn,day1);await record(cleanEvent(abandoned)!,db.fetchFn,day1);
		expect((await readStats(7,db.fetchFn,day1)).totals).toMatchObject({budget_closed:1,budget_abandoned:1,budget_sampled:1,'budget:coverage:empty':1,
			[`sampling:attempt:${CP_STATS_MODEL}:budget`]:2,[`sampling:outcome:${CP_STATS_MODEL}:budget:unmounted`]:1});
	});
	it('preserves old plan model tags and enforces coherent v3 sampling envelopes',()=>{
		const plan={cp:'same',target:'1760to1789',role:'dealer',model:'cp-2026-10-25'} as const;
		expect(cleanEvent({event:'build_saved',v:2,id:crypto.randomUUID(),plan})?.plan?.model).toBe('cp-2026-10-25');
		const id=crypto.randomUUID();
		const skipped={event:'build_saved',v:3,id,sampling:samplingAttempt('plan','unsettled')};
		expect(cleanEvent(skipped)).toEqual(skipped);
		for(const bad of [
			{...skipped,plan},
			{...skipped,sampling:samplingAttempt('budget','unsettled')},
			{...skipped,sampling:samplingAttempt('plan')},
			{...skipped,sampling:{...skipped.sampling,reason:'private text'}},
			{...skipped,sampling:{...skipped.sampling,extra:'private'}},
			{...skipped,sampling:{...skipped.sampling,model:'unknown'}},
			{...skipped,id:undefined}, {...skipped,v:2}, {...skipped,sampling:undefined},
			{...skipped,plan:{...plan,model:'unknown'}},
			{...skipped,sampling:samplingAttempt('plan'),plan},
		])expect(cleanEvent(bad)).toBeNull();
	});
	it('does not mix preview share activity into production counters', async () => {
		env.VERCEL_ENV = 'preview';
		const db = fakeRedis();
		await count({event: 'share_created'}, db.fetchFn, day1);
		expect(db.fetchFn).not.toHaveBeenCalled();
	});

	it('limits browser bursts without counting rejected events', async () => {
		const db = fakeRedis();
		for (let i = 0; i < 120; i++) await record({ event: 'sim_open' }, db.fetchFn, day1, 'test-address');
		expect(await record({ event: 'sim_open' }, db.fetchFn, day1, 'test-address')).toBe('limited');
		expect((await readStats(7, db.fetchFn, day1)).totals.sim_open).toBe(120);
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
