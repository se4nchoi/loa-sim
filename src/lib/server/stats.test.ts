import {beforeAll, afterAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';

const env: Record<string,string> = {};
vi.mock('$env/dynamic/private', () => ({env}));
let pg: PGlite;
const query = vi.fn(async (sql: string, params: unknown[] = []) => (await pg.query(sql, params)).rows);
vi.mock('./stats-postgres', () => ({statsConfigured: () => !!env.STATS_DATABASE_URL, statsQuery: (...args: Parameters<typeof query>) => query(...args)}));
beforeAll(async () => {
 pg = new PGlite();
 await pg.exec(readFileSync('migrations/001-stats-postgres.sql', 'utf8'));
});
afterAll(async () => { await pg.close(); });
const {cleanEvent, count, record, isBot, readStats} = await import('./stats');
const {budgetSample,insightCohort}=await import('$lib/stats-insights');
const {CP_STATS_MODEL}=await import('$lib/stats-versions');
const {samplingAttempt}=await import('$lib/stats-sampling');

function database() { return {fetchFn: vi.fn() as unknown as typeof fetch}; }
const day1 = Date.parse('2026-10-21T12:00:00Z'), day2 = Date.parse('2026-10-22T12:00:00Z');
beforeEach(async () => {
 for (const key of Object.keys(env)) delete env[key];
 env.STATS_DATABASE_URL = 'postgres://test-only';
 await pg.exec('TRUNCATE loa_stats_events, loa_stats_counters, loa_stats_characters, loa_stats_rates, loa_stats_meta, loa_stats_legacy_days, loa_stats_legacy_ranges');
 query.mockClear();
});

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
		const db = database();
		await count({event: 'lookup', region: 'NA', name: 'Soulshan', class: 'souleater'}, db.fetchFn, day1);
		await count({event: 'lookup', region: 'NA', name: 'soulshan', class: 'made_up'}, db.fetchFn, day1);
		await count({event: 'lookup', region: 'CE', name: 'Other', class: 'bard'}, db.fetchFn, day2);
		await count({event: 'share_created'}, db.fetchFn, day2);
		const stored = await pg.query<{character_hash:string;fields:string[]}>('SELECT character_hash, fields FROM loa_stats_events');
		expect(new Set(stored.rows.filter(r=>r.character_hash).map(r=>r.character_hash)).size).toBe(2);
		expect(JSON.stringify(stored.rows)).not.toMatch(/soulshan/i);

		const report = await readStats(30, db.fetchFn, day2);
		expect(report.from).toBe('2026-10-20');
		expect(report.to).toBe('2026-10-22');
		expect(report.distinctCharacters).toBe(2);
		expect(report.totals).toEqual({'class:Bard': 1, 'class:Unknown': 1, 'unknown:unrecognized': 1, 'class:Souleater': 1, lookup: 3, 'lookup:CE': 1, 'lookup:NA': 2, share_created: 1});
		expect(report.days.map((d) => [d.date, d.distinctCharacters])).toEqual([['2026-10-22', 1], ['2026-10-21', 1], ['2026-10-20', 0]]);
	});

	it('does not count retried IDs again, including across UTC midnight', async () => {
		const db = database();
		const event = {event: 'budget_opened', id: crypto.randomUUID()} as const;
		await record(event, db.fetchFn, day1);
		await record(event, db.fetchFn, day2);
		const report = await readStats(7, db.fetchFn, day2);
		expect(report.totals.budget_opened).toBe(1);
		expect(report.explorationSince).toBe('2026-10-21');
	});

	it('recognizes display names and records missing metadata separately from unrecognized metadata', async () => {
		const db = database();
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
		const db = database();
		await record({event:'build_saved',plan},db.fetchFn,day1);
		expect((await readStats(7,db.fetchFn,day1)).totals).toMatchObject({'plan:count':1,'plan:cp:10to20':1,'plan:level:1790to1819':1,'plan:role:dealer':1});
	});
	it('requires v2 receipts for rich samples and keeps cohort relationships in the daily counters',async()=>{
		const insight=budgetSample(insightCohort('souleater','NA/Soulshan',1784,false)!,[{key:'x',title:'x',detail:'',section:'Equipment',missing:[],average:200000}],100,105)!;
		const event={event:'budget_sampled',v:2,id:crypto.randomUUID(),insight} as const;
		expect(cleanEvent(event)).toEqual(event);
		expect(cleanEvent({...event,v:undefined})).toBeNull();
		expect(cleanEvent({...event,event:'sim_open'})).toBeNull();
		const db=database();await record(event,db.fetchFn,day1);await record(event,db.fetchFn,day1);
		const report=await readStats(7,db.fetchFn,day1);
		expect(report.totals).toMatchObject({budget_sampled:1,'budget:coverage:complete':1,'budget:cost:100to500k':1});
		expect(Object.keys(report.totals)).toContain(`budget:curve:${CP_STATS_MODEL}:NA:souleater:dealer:1760to1789:100to500k:5to10:na:standard`);
	});

	it('strict ingestion surfaces outages, while product actions remain best effort', async () => {
		const down = fetch;
		query.mockRejectedValueOnce(new Error('offline'));
		await expect(record({event: 'sim_open'}, down)).rejects.toThrow();
		query.mockRejectedValueOnce(new Error('offline'));
		await expect(count({event: 'sim_open'}, down)).resolves.toBeUndefined();
	});
	it('atomically counts an applied choice or its exclusion, including retries across midnight',async()=>{
		const {decisionSample}=await import('$lib/stats-insights');
		const upgrade={key:'gem',category:'gem',gainPct:2,title:'private',detail:'private',count:1,approximate:false} as const;
		const insight=decisionSample(insightCohort('souleater','NA/A',1780,false)!,upgrade,'gold',[upgrade],{gem:100000},{},{})!;
		const event={event:'upgrade_applied',category:'gem',v:3,id:crypto.randomUUID(),insight,sampling:samplingAttempt('decision')} as const;
		expect(cleanEvent(event)).toEqual(event);
		const db=database();
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
		const db=database();await record(cleanEvent(closed)!,db.fetchFn,day1);await record(cleanEvent(abandoned)!,db.fetchFn,day1);
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
		const db = database();
		await count({event: 'share_created'}, db.fetchFn, day1);
		expect(query).not.toHaveBeenCalled();
	});

	it('limits browser bursts without counting rejected events', async () => {
		const db = database();
		for (let i = 0; i < 120; i++) await record({ event: 'sim_open' }, db.fetchFn, day1, 'test-address');
		expect(await record({ event: 'sim_open' }, db.fetchFn, day1, 'test-address')).toBe('limited');
		expect((await readStats(7, db.fetchFn, day1)).totals.sim_open).toBe(120);
	});

	it('never falls back to Redis when Postgres is unavailable', async () => {
		const send = vi.fn() as unknown as typeof fetch;
		query.mockRejectedValueOnce(new Error('offline'));
		await expect(count({event:'sim_open'},send)).resolves.toBeUndefined();
		delete env.STATS_DATABASE_URL;
		await expect(count({event:'sim_open'},send)).resolves.toBeUndefined();
		expect(query).toHaveBeenCalledTimes(1);
		expect(send).not.toHaveBeenCalled();
	});

	it('recognises link-preview bots', () => {
		expect(isBot('Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)')).toBe(true);
		expect(isBot(null)).toBe(true);
		expect(isBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36')).toBe(false);
	});
});


describe('Postgres batch atomicity and retention', () => {
 it('deduplicates within a batch and across concurrent submissions', async () => {
  const {recordBatch} = await import('./stats');
  const e = {event:'sim_open', id:crypto.randomUUID()} as const;
  await Promise.all([recordBatch([e,e],fetch,day1,'a'),recordBatch([e],fetch,day1,'b')]);
  expect((await readStats(7,fetch,day1)).totals.sim_open).toBe(1);
 });
 it('rolls back a broken batch without partial counters or receipts', async () => {
  const {observation} = await import('./stats');
  const valid = observation({event:'sim_open',id:crypto.randomUUID()},day1);
  const bad = {...observation({event:'sim_open',id:crypto.randomUUID()},day1),day:'invalid-date'};
  await expect(pg.query('SELECT loa_stats_ingest($1::jsonb,NULL,$2::timestamptz)',[JSON.stringify([valid,bad]),new Date(day1).toISOString()])).rejects.toThrow();
  expect((await readStats(7,fetch,day1)).totals).toEqual({});
  expect((await pg.query('SELECT * FROM loa_stats_events')).rows).toHaveLength(0);
 });
 it('does not charge retries against the limiter, and rejects oversized bursts as a batch', async () => {
  const {recordBatch} = await import('./stats');
  const events=Array.from({length:16},()=>({event:'sim_open',id:crypto.randomUUID()} as const));
  for(let i=0;i<10;i++) expect(await recordBatch(events,fetch,day1,'a')).toBe('accepted');
  expect((await readStats(7,fetch,day1)).totals.sim_open).toBe(16);
  for(let i=0;i<104;i++) await record({event:'sim_open'},fetch,day1,'a');
  expect(await record({event:'sim_open'},fetch,day1,'a')).toBe('limited');
 });
 it('retains aggregate history after detailed events expire', async () => {
  await record({event:'lookup',region:'NA',name:'Private',id:crypto.randomUUID()},fetch,day1);
  const later=day1+91*86400000;
  await record({event:'sim_open'},fetch,later);
  expect((await pg.query('SELECT * FROM loa_stats_events')).rows).toHaveLength(1);
  expect((await readStats(120,fetch,later)).totals.lookup).toBe(1);
 });
 it('combines imported summaries without relabeling or duplicating their counters', async () => {
  await pg.query('INSERT INTO loa_stats_legacy_days VALUES($1,$2::jsonb,$3)', ['2026-10-21',JSON.stringify({sim_open:4,lookup:2}),2]);
  await pg.query('INSERT INTO loa_stats_legacy_ranges VALUES($1,$1,$2)', ['2026-10-21',2]);
  await record({event:'sim_open'},fetch,day1);
  const report=await readStats(7,fetch,day1);
  expect(report.totals).toEqual({sim_open:5,lookup:2});
  expect(report.distinctCharacters).toBe(2);
  expect(report.legacyDistinct).toBe(true);
 });
});
