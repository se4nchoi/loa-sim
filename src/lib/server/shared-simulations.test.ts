import {beforeEach, describe, expect, it, vi} from 'vitest';
import fixture from '$lib/upgrade-planner/fixtures/na-soulshan.json';
import {initSimState} from '$lib/upgrade-planner/simulate';
import {simulationCP} from '$lib/upgrade-planner/saved-simulations';
import type {Loadout} from '$lib/upgrade-planner/types';
import {randomBytes} from 'node:crypto';
import {deflateSync, inflateSync} from 'node:zlib';

const env: Record<string,string> = {};
vi.mock('$env/dynamic/private', () => ({env}));
const {SHARE_TTL,MAX_SHARE_BYTES,sharedPlan,redisConfig,allowShare,createSharedSimulation,getSharedSimulation} = await import('./shared-simulations');
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
beforeEach(() => { for (const key of Object.keys(env)) delete env[key]; env.STORAGE_KV_REST_API_URL='https://redis.example'; env.STORAGE_KV_REST_API_TOKEN='secret'; });

describe('shared simulations', () => {
 it('recalculates old links without changing the CP recorded when they were shared', async () => {
  const db = fakeRedis(), now = 1000;
  const shared = await createSharedSimulation(plan(), db.fetchFn, now);
  const id = shared.path.split('/').at(-1)!;
  const key = `loa-sim:share:${id}`;
  const entry = JSON.parse(inflateSync(Buffer.from(db.values.get(key)!, 'base64url')).toString());
  entry.originalCp = 1;
  db.values.set(key, deflateSync(JSON.stringify(entry)).toString('base64url'));
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
  expect(db.values.get(`loa-sim:share:${id}`)!.length).toBeGreaterThan(MAX_SHARE_BYTES);
  const restored = await getSharedSimulation(id, 'Soulshan', db.fetchFn, 1000);
  expect(restored?.plan.loadout).toEqual(accepted.loadout);
 });
 it('rejects corrupt or oversized compressed records instead of rendering them', async () => {
  const db = fakeRedis(), key = 'loa-sim:share:abcdefgh';
  for (const value of ['not compressed', deflateSync('null').toString('base64url'),
   deflateSync('x'.repeat(MAX_SHARE_BYTES * 3)).toString('base64url')]) {
   db.values.set(key, value);
   await expect(getSharedSimulation('abcdefgh', 'Soulshan', db.fetchFn)).rejects.toThrow();
  }
 });
	it('supports integration and direct REST variable names without exposing credentials in paths', () => {
		expect(redisConfig()).toEqual({url:'https://redis.example',token:'secret'});
		delete env.STORAGE_KV_REST_API_URL; delete env.STORAGE_KV_REST_API_TOKEN;
		expect(redisConfig()).toBeNull();
		env.UPSTASH_REDIS_REST_URL='https://direct.example'; env.UPSTASH_REDIS_REST_TOKEN='direct';
		expect(redisConfig()?.url).toBe('https://direct.example');
	});
	it('freezes baseline and edits, uses immutable 30-day SET, and reads without refreshing expiry', async () => {
		const db = fakeRedis(), original = plan(), now = 1_000_000;
		const shared = await createSharedSimulation(original,db.fetchFn,now);
		expect(shared.path).toMatch(/^\/s\/Soulshan\/[A-Za-z0-9_-]{8}$/);
		expect(shared.expiresAt).toBe(now+30*24*60*60*1000);
		expect(db.calls[0].slice(3)).toEqual(['EX',SHARE_TTL,'NX']);
		expect(original).not.toHaveProperty('pinned'); expect(original.id).toBe('shared');
		original.state.gear.weapon!.honing = 1; // Later sender edits cannot mutate the snapshot.
		const id = shared.path.split('/').at(-1)!;
		const restored = await getSharedSimulation(id,'Soulshan',db.fetchFn,now+1000);
		expect(restored?.plan.state.gear.weapon?.honing).toBe(25);
		expect(restored?.plan.loadout).toEqual(loadout);
		expect(restored?.originalCp).toBe(simulationCP(restored!.plan));
		expect(db.calls.at(-1)).toEqual(['GET',`loa-sim:share:${id}`]);
		expect(await getSharedSimulation(id,'Soulshan',db.fetchFn,shared.expiresAt)).toBeNull();
		expect(await getSharedSimulation(id,'Anotherplayer',db.fetchFn,now)).toBeNull();
	});
	it('returns missing for invalid IDs without hitting storage', async () => {
		const db=fakeRedis(); expect(await getSharedSimulation('../bad','Soulshan',db.fetchFn)).toBeNull(); expect(db.calls).toHaveLength(0);
		expect(await getSharedSimulation('abcdefgh','Soulshan',db.fetchFn)).toBeNull();
	});
	it('retries collisions, never overwrites an existing link, and reports storage failure', async () => {
		const db=fakeRedis(); let count=0;
		const collide = vi.fn(async (...args: Parameters<typeof fetch>) => ++count === 1 ? new Response('{"result":null}') : db.fetchFn(...args)) as typeof fetch;
		await createSharedSimulation(plan(),collide); expect(count).toBe(2);
		await expect(createSharedSimulation(plan(),vi.fn(async () => new Response('{"result":null}')) as typeof fetch)).rejects.toThrow('unique');
		await expect(createSharedSimulation(plan(),vi.fn(async () => new Response('{"error":"private provider details"}')) as typeof fetch)).rejects.toThrow('could not complete');
	});
	it('uses a shared expiring rate counter without retaining the raw client address', async () => {
		const db=fakeRedis();
		for (let i=0;i<10;i++) expect(await allowShare('1.2.3.4',db.fetchFn)).toBe(true);
		expect(await allowShare('1.2.3.4',db.fetchFn)).toBe(false);
		expect(JSON.stringify(db.calls)).not.toContain('1.2.3.4'); expect(db.calls[0][1]).toContain('600');
	});
	it('rejects oversized or malformed snapshots and invalid character keys', () => {
		expect(() => sharedPlan('x'.repeat(MAX_SHARE_BYTES+1))).toThrow('large');
		expect(() => sharedPlan('{}')).toThrow();
		expect(() => sharedPlan(JSON.stringify({...plan(),characterKey:'na/name/extra'}))).toThrow('unsupported');
	});
});
