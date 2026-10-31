import {beforeAll, afterAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import fixture from '$lib/upgrade-planner/fixtures/na-soulshan.json';
import {initSimState} from '$lib/upgrade-planner/simulate';
import {simulationCP} from '$lib/upgrade-planner/saved-simulations';
import type {Loadout} from '$lib/upgrade-planner/types';
import {randomBytes} from 'node:crypto';
import {deflateSync, inflateSync} from 'node:zlib';

const env: Record<string,string> = {};
vi.mock('$env/dynamic/private', () => ({env}));
let pg: PGlite;
const query = vi.fn(async (sql:string,params:unknown[]=[]) => (await pg.query(sql,params)).rows);
vi.mock('./postgres',()=>({postgresConfigured:()=>!!env.STATS_DATABASE_URL,postgresQuery:(...args:Parameters<typeof query>)=>query(...args)}));
beforeAll(async()=>{pg=new PGlite();await pg.exec(readFileSync('migrations/002-sharing-postgres.sql','utf8'));});
afterAll(async()=>{await pg.close();});
async function payload(id:string){return (await pg.query<{payload:string}>('SELECT payload FROM loa_shared_simulations WHERE id=$1',[id])).rows[0]?.payload;}
async function setPayload(id:string,value:string){await pg.query('INSERT INTO loa_shared_simulations VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload',[id,'soulshan',value,new Date(Date.now()+86400000)]);}

const {SHARE_TTL,MAX_SHARE_BYTES,sharedPlan,sharingConfigured,allowShare,createSharedSimulation,getSharedSimulation} = await import('./shared-simulations');
const loadout = fixture as unknown as Loadout;
function plan() {
	const state = initSimState(loadout); state.gear.weapon!.honing = 25; state.gems[0].level = 10;
	return sharedPlan(JSON.stringify({version:1,id:'local-browser-id',name:'Test upgrades',characterKey:'NA/Soulshan',savedAt:0,pinned:true,loadout,state}));
}
function fakeRedis() {
	const values = new Map<string,string>();
	const calls: (string | number)[][] = [];
	let limit = 0;
	const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
		const args = JSON.parse(String(init?.body)); calls.push(args);
		let result: unknown = null;
		if (args[0] === 'SET' && !values.has(args[1])) { values.set(args[1],args[2]); result = 'OK'; }
		if (args[0] === 'GET') result = values.get(args[1]) ?? null;
		if (args[0] === 'EVAL') result = ++limit;
		return new Response(JSON.stringify({result}));
	}) as unknown as typeof fetch;
	return {values,calls,fetchFn};
}
beforeEach(async () => {
 for (const key of Object.keys(env)) delete env[key];
 env.STATS_DATABASE_URL='postgres://test-only';env.STORAGE_KV_REST_API_URL='https://redis.example';env.STORAGE_KV_REST_API_TOKEN='secret';
 await pg.exec('TRUNCATE loa_shared_simulations, loa_share_limits');query.mockClear();
});

describe('shared simulations', () => {
 it('recalculates old links without changing the CP recorded when they were shared', async () => {
  const db = fakeRedis(), now = 1000;
  const shared = await createSharedSimulation(plan(), db.fetchFn, now);
  const id = shared.path.split('/').at(-1)!;
  const key = `loa-sim:share:${id}`;
  const entry = JSON.parse(inflateSync(Buffer.from((await payload(id))!, 'base64url')).toString());
  entry.originalCp = 1;
  await setPayload(id,deflateSync(JSON.stringify(entry)).toString('base64url'));
  const restored = await getSharedSimulation(id, 'Soulshan', db.fetchFn, now);
  expect(restored?.originalCp).toBe(1);
  expect(restored?.calculatedCp).toBe(simulationCP(restored!.plan));
 });
 it('round-trips near-limit snapshots even when encoded storage exceeds the raw request limit', async () => {
  const db = fakeRedis(), input = plan();
  input.loadout = {classId: loadout.classId, itemLevel: loadout.itemLevel,
   battlePoint: {isSupport: false, parts: loadout.battlePoint.parts.filter((p) => p.type === 1)}} as Loadout;
  input.state = initSimState(input.loadout);
  // Snapshot metadata can be poorly compressible even when the request fits the raw JSON limit.
  const value = input.loadout as Loadout & { auditMetadata: string };
  value.auditMetadata = '';
  const remaining = MAX_SHARE_BYTES - Buffer.byteLength(JSON.stringify(input)) - 128;
  const alphabet = Array.from({length: 94}, (_, i) => String.fromCharCode(i + 33)).filter((c) => c !== '"' && c !== '\\');
  value.auditMetadata = Array.from(randomBytes(remaining), (n) => alphabet[n % alphabet.length]).join('');
  const accepted = sharedPlan(JSON.stringify(input));
  const shared = await createSharedSimulation(accepted, db.fetchFn, 1000);
  const id = shared.path.split('/').at(-1)!;
  expect((await payload(id))!.length).toBeGreaterThan(MAX_SHARE_BYTES);
  const restored = await getSharedSimulation(id, 'Soulshan', db.fetchFn, 1000);
  expect(restored?.plan.loadout).toEqual(accepted.loadout);
 });
 it('rejects corrupt or oversized compressed records instead of rendering them', async () => {
  const db = fakeRedis(), key = 'loa-sim:share:abcdefgh';
  for (const value of ['not compressed', deflateSync('null').toString('base64url'),
   deflateSync('x'.repeat(MAX_SHARE_BYTES * 3)).toString('base64url')]) {
   await setPayload('abcdefgh',value);
   await expect(getSharedSimulation('abcdefgh', 'Soulshan', db.fetchFn)).rejects.toThrow();
  }
 });
	it('uses the separate Postgres configuration even without Redis', () => {
  expect(sharingConfigured()).toBe(true);
  delete env.STORAGE_KV_REST_API_URL;delete env.STORAGE_KV_REST_API_TOKEN;
  expect(sharingConfigured()).toBe(true);
  delete env.STATS_DATABASE_URL;expect(sharingConfigured()).toBe(false);
 });
	it('freezes baseline and edits, uses immutable 30-day storage, and reads without refreshing expiry', async () => {
		const db = fakeRedis(), original = plan(), now = 1_000_000;
		const shared = await createSharedSimulation(original,db.fetchFn,now);
		expect(shared.path).toMatch(/^\/s\/Soulshan\/[A-Za-z0-9_-]{8}$/);
		expect(shared.expiresAt).toBe(now+30*24*60*60*1000);
		expect((await pg.query<{expires_at:Date}>('SELECT expires_at FROM loa_shared_simulations')).rows[0].expires_at.getTime()).toBe(shared.expiresAt);
		expect(original).not.toHaveProperty('pinned'); expect(original.id).toBe('shared');
		original.state.gear.weapon!.honing = 1; // Later sender edits cannot mutate the snapshot.
		const id = shared.path.split('/').at(-1)!;
		const restored = await getSharedSimulation(id,'Soulshan',db.fetchFn,now+1000);
		expect(restored?.plan.state.gear.weapon?.honing).toBe(25);
		expect(restored?.plan.loadout).toEqual(loadout);
		expect(restored?.originalCp).toBe(simulationCP(restored!.plan));
		expect(db.calls).toHaveLength(0);
		expect(await getSharedSimulation(id,'Soulshan',db.fetchFn,shared.expiresAt)).toBeNull();
		expect(await getSharedSimulation(id,'Anotherplayer',db.fetchFn,now)).toBeNull();
	});
	it('returns missing for invalid IDs without hitting storage', async () => {
		const db=fakeRedis(); expect(await getSharedSimulation('../bad','Soulshan',db.fetchFn)).toBeNull(); expect(db.calls).toHaveLength(0);
		expect(await getSharedSimulation('abcdefgh','Soulshan',db.fetchFn)).toBeNull();
	});
	it('retries ID collisions without overwriting existing builds',async()=>{
  const db=fakeRedis();query.mockResolvedValueOnce([]);
  await createSharedSimulation(plan(),db.fetchFn);expect(query).toHaveBeenCalledTimes(2);
  query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  await expect(createSharedSimulation(plan(),db.fetchFn)).rejects.toThrow('unique');
  query.mockRejectedValueOnce(new Error('storage down'));
  await expect(createSharedSimulation(plan(),db.fetchFn)).rejects.toThrow();
  expect(db.calls).toHaveLength(0);
 });
	it('uses a shared expiring rate counter without retaining the raw client address', async () => {
		const db=fakeRedis();
		for (let i=0;i<10;i++) expect(await allowShare('1.2.3.4',db.fetchFn)).toBe(true);
		expect(await allowShare('1.2.3.4',db.fetchFn)).toBe(false);
		expect(JSON.stringify(query.mock.calls)).not.toContain('1.2.3.4'); expect(db.calls).toHaveLength(0);
	});
	it('rejects oversized or malformed snapshots and invalid character keys', () => {
		expect(() => sharedPlan('x'.repeat(MAX_SHARE_BYTES+1))).toThrow('large');
		expect(() => sharedPlan('{}')).toThrow();
		expect(() => sharedPlan(JSON.stringify({...plan(),characterKey:'na/name/extra'}))).toThrow('unsupported');
	});
});


describe('legacy share recovery',()=>{
 it('imports a valid Redis build with its original ID and expiry, then reads only Postgres',async()=>{
  const db=fakeRedis(),now=Date.now();
  const entry={version:1,plan:plan(),expiresAt:now+10000,originalCp:1};
  db.values.set('loa-sim:share:abcdefgh',deflateSync(JSON.stringify(entry)).toString('base64url'));
  const restored=await getSharedSimulation('abcdefgh','Soulshan',db.fetchFn,now);
  expect(restored?.expiresAt).toBe(entry.expiresAt);
  expect((await pg.query<{expires_at:Date}>('SELECT expires_at FROM loa_shared_simulations')).rows[0].expires_at.getTime()).toBe(entry.expiresAt);
  expect(db.calls).toHaveLength(1);
  await getSharedSimulation('abcdefgh','Soulshan',db.fetchFn,now+1000);
  expect(db.calls).toHaveLength(1);
 });
 it('does not label a Redis outage as a missing or expired build',async()=>{
  const down=vi.fn(async()=>Response.json({error:'ERR max requests limit exceeded'})) as typeof fetch;
  await expect(getSharedSimulation('abcdefgh','Soulshan',down)).rejects.toThrow();
 });
 it('stops all Redis fallback after the migration window',async()=>{
  const {LEGACY_SHARE_UNTIL}=await import('./shared-simulations');const db=fakeRedis();
  expect(await getSharedSimulation('abcdefgh','Soulshan',db.fetchFn,LEGACY_SHARE_UNTIL)).toBeNull();
  expect(db.calls).toHaveLength(0);
 });
 it('creates and opens new shares while Redis is down or unconfigured',async()=>{
  const db=fakeRedis();delete env.STORAGE_KV_REST_API_URL;delete env.STORAGE_KV_REST_API_TOKEN;
  const created=await createSharedSimulation(plan(),db.fetchFn);const id=created.path.split('/').at(-1)!;
  expect(await getSharedSimulation(id,'Soulshan',db.fetchFn)).not.toBeNull();
  expect(db.calls).toHaveLength(0);
 });
 it('resets the ten-minute sharing limiter at expiry',async()=>{
  const db=fakeRedis(),now=1000;
  for(let i=0;i<10;i++)expect(await allowShare('address',db.fetchFn,now)).toBe(true);
  expect(await allowShare('address',db.fetchFn,now+599999)).toBe(false);
  expect(await allowShare('address',db.fetchFn,now+600000)).toBe(true);
 });
});


it('enforces database expiry and cleans expired shares without deleting active ones',async()=>{
 const db=fakeRedis(),now=Date.now();
 const old=await createSharedSimulation(plan(),db.fetchFn,now-31*86400000);
 const oldId=old.path.split('/').at(-1)!;
 expect(await getSharedSimulation(oldId,'Soulshan',db.fetchFn,now)).toBeNull();
 expect(db.calls).toHaveLength(0);
 const active=await createSharedSimulation(plan(),db.fetchFn,now);
 const activeId=active.path.split('/').at(-1)!;
 expect(await payload(oldId)).toBeUndefined();
 expect(await payload(activeId)).toBeDefined();
 await pg.query('UPDATE loa_shared_simulations SET expires_at=$1 WHERE id=$2',[new Date(now),activeId]);
 expect(await getSharedSimulation(activeId,'Soulshan',db.fetchFn,now)).toBeNull();
 expect(db.calls).toHaveLength(0);
});
