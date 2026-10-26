// Aggregate counters only. Existing keys and character sketches remain compatible with legacy data.
import { createHash } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { REGIONS } from '$lib/bible-data';
import { CP_BUCKETS, LEVEL_BUCKETS, LEVEL_MILESTONES, PLAN_SECTIONS, type PlanObservation } from '$lib/plan-stats';
import { cleanInsight, insightFields } from '$lib/stats-insights';
import { CP_STATS_MODEL } from '$lib/stats-versions';
import { EXPLORATION_EVENTS, UPGRADE_CATEGORIES, type CountEvent, type StatsDay, type StatsReport } from '$lib/stats-model';
import { className, resolveClass } from '$lib/upgrade-planner/class-names';
import { command, pipeline, redisConfig } from './redis';
export type { CountEvent, StatsDay, StatsReport } from '$lib/stats-model';

export const STATS_START = '2026-10-20';
export const MAX_STATS_DAYS = 3660;
const CLIENT_EVENTS = ['lookup', 'lookup_fail', 'sim_open', 'build_saved', ...EXPLORATION_EVENTS.map(([event])=>event)];
const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10);
const countsKey = (day: string) => `loa-sim:stats:${day}`;
const charactersKey = (day: string) => `loa-sim:stats:characters:${day}`;
const SINCE_KEY = 'loa-sim:stats:exploration-since';
export const statsEnabled = () => !env.VERCEL_ENV || env.VERCEL_ENV === 'production';

export function cleanEvent(body: unknown): CountEvent | null {
	if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
	const { event, region, name, class: cls, id, source, category, plan, insight, v } = body as Record<string, unknown>;
	if (typeof event !== 'string' || !CLIENT_EVENTS.includes(event)) return null;
	const out: CountEvent = { event: event as CountEvent['event'] };
	if (v!==undefined) { if(v!==2) return null; out.v=2; }
	if (id !== undefined) {
		if (typeof id !== 'string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) return null;
		out.id = id;
	}
	if (event === 'lookup' || event === 'lookup_fail') {
		const r = typeof region === 'string' ? region.toUpperCase() : '';
		if (!(REGIONS as readonly string[]).includes(r)) return null;
		out.region = r;
	}
	if (event === 'lookup') {
		if (typeof name !== 'string' || !/^[^/?#\s]{1,40}$/u.test(name.trim())) return null;
		out.name = name.trim();
		if (typeof cls === 'string' && cls.length <= 40) out.class = cls;
		if (source !== undefined && source !== 'remote' && source !== 'paste') return null;
		if (source) out.source = source;
	}
	if (event === 'upgrade_applied') {
		if (!(UPGRADE_CATEGORIES as readonly unknown[]).includes(category)) return null;
		out.category = category as CountEvent['category'];
	}
	if (plan !== undefined) {
		if (event !== 'build_saved' || !plan || typeof plan !== 'object' || Array.isArray(plan)) return null;
		const p = plan as Record<string, unknown>;
		if (Object.keys(p).some(k => !['cp', 'target', 'role','start','sections','dominant','shape','weapon','gems','classId','region','model','milestones'].includes(k)) ||
			!CP_BUCKETS.some(([k]) => k === p.cp) || !LEVEL_BUCKETS.some(([k]) => k === p.target) ||
			typeof p.role !== 'string' || !['dealer', 'support'].includes(p.role)) return null;
		out.plan = {cp:p.cp, target:p.target, role:p.role} as PlanObservation;
		if(p.model!==undefined){if(p.model!==CP_STATS_MODEL)return null;out.plan.model=CP_STATS_MODEL;}
		if(p.classId!==undefined){if(typeof p.classId!=='string'||resolveClass(p.classId)!==p.classId)return null;out.plan.classId=p.classId;}
		if(p.region!==undefined){if(p.region!=='NA'&&p.region!=='CE')return null;out.plan.region=p.region;}
		if (p.start!==undefined) {if(!LEVEL_BUCKETS.some(([k])=>k===p.start)) return null;out.plan.start=p.start as PlanObservation['start'];}
		if(p.milestones!==undefined){if(!Array.isArray(p.milestones)||p.milestones.length>LEVEL_MILESTONES.length||new Set(p.milestones).size!==p.milestones.length||p.milestones.some(m=>!(LEVEL_MILESTONES as readonly unknown[]).includes(m)))return null;out.plan.milestones=p.milestones as NonNullable<PlanObservation['milestones']>;}
		if (p.sections!==undefined) {
			if(!Array.isArray(p.sections)||p.sections.length>PLAN_SECTIONS.length||new Set(p.sections).size!==p.sections.length||p.sections.some(s=>!(PLAN_SECTIONS as readonly unknown[]).includes(s)))return null;
			out.plan.sections=p.sections as NonNullable<PlanObservation['sections']>;
		}
		const choices={dominant:[...PLAN_SECTIONS,'none','tie'],shape:['unchanged','weapon-only','single-system','mixed'],weapon:['under20','20to24','25','sidereal'],gems:['under9','9','some10','all10']} as const;
		for (const key of ['dominant','shape','weapon','gems'] as const) if(p[key]!==undefined){if(!(choices[key] as readonly unknown[]).includes(p[key]))return null;Object.assign(out.plan,{[key]:p[key]});}
	}
	if (insight!==undefined) {
		const sample=cleanInsight(insight,UPGRADE_CATEGORIES);
		if(!sample || `${sample.kind==='opportunity'?'opportunity':sample.kind}_sampled`!==event || !out.id || v!==2)return null;
		out.insight=sample;
	} else if (['opportunity_sampled','budget_sampled','decision_sampled'].includes(event)) return null;
	return out;
}

// Check types and counters before mutation. The receipt is set last, inside the same serialized script.
export const COUNT_SCRIPT = `
local expected = {'hash', 'string', 'string', 'string', 'string'}
for i, key in ipairs(KEYS) do
  local kind = redis.call('TYPE', key).ok
  if kind ~= 'none' and kind ~= expected[i] then return redis.error_reply('stats key type mismatch') end
end
if ARGV[1] ~= '' and redis.call('EXISTS', KEYS[3]) == 1 then return 0 end
if ARGV[5] == 'limited' then
  local rate = redis.call('INCR', KEYS[4])
  if rate == 1 then redis.call('EXPIRE', KEYS[4], 60) end
  if rate > 120 then return -1 end
end
if ARGV[2] ~= '' then redis.call('PFCOUNT', KEYS[2]) end
local fields = cjson.decode(ARGV[3])
for _, field in ipairs(fields) do
  local old = redis.call('HGET', KEYS[1], field)
  if old and (not string.match(old, '^%d+$') or tonumber(old) > 9007199254740000) then return redis.error_reply('invalid stats counter') end
end
for _, field in ipairs(fields) do redis.call('HINCRBY', KEYS[1], field, 1) end
if ARGV[2] ~= '' then redis.call('PFADD', KEYS[2], ARGV[2]) end
if ARGV[4] ~= '' then redis.call('SET', KEYS[5], ARGV[4], 'NX') end
if ARGV[1] ~= '' then redis.call('SET', KEYS[3], '1', 'EX', 604800) end
return 1`;

/** Strict ingestion: acknowledge persisted events. Product callers use the best-effort wrapper below. */
function recordCommand(e: CountEvent, at: number, address?: string): (string | number)[] {
	const fields: string[] = [e.event];
	if (e.region) fields.push(`${e.event}:${e.region}`);
	if (e.event === 'lookup') {
		const cls = resolveClass(e.class);
		fields.push(`class:${cls ? className(cls) : 'Unknown'}`);
		if (!cls) fields.push(`unknown:${e.class ? 'unrecognized' : 'missing'}`);
		if (e.source) fields.push(`source:${e.source}`);
	}
	if (e.category) fields.push(`upgrade:${e.category}`);
	if (e.plan) fields.push('plan:count', `plan:cp:${e.plan.cp}`, `plan:level:${e.plan.target}`, `plan:role:${e.plan.role}`);
	if (e.plan?.start) fields.push(`plan:progression:${e.plan.model??'legacy'}:${e.plan.region??'unknown'}:${e.plan.classId??'unknown'}:${e.plan.role}:${e.plan.start}:${e.plan.target}`,`plan:headroom:${e.plan.model??'legacy'}:${e.plan.region??'unknown'}:${e.plan.classId??'unknown'}:${e.plan.role}:${e.plan.start}:${e.plan.cp}`);
	for (const section of e.plan?.sections??[]) fields.push(`plan:section:${section}`);
	for (const milestone of e.plan?.milestones??[]) fields.push(`plan:milestone:${milestone}`);
	for(const key of ['dominant','shape','weapon','gems'] as const) if(e.plan?.[key]) fields.push(`plan:${key}:${e.plan[key]}`);
	if(e.insight) fields.push(...insightFields(e.insight));
	const hash = (s: string) => createHash('sha256').update(s).digest('hex');
	const character = e.event === 'lookup' && e.region && e.name ? hash(`${e.region}/${e.name}`.toLowerCase()).slice(0, 16) : '';
	const id = e.id ? hash(e.id) : '';
	const rate = address ? hash(address) : `server:${e.event}`;
	const exploration = EXPLORATION_EVENTS.some(([event])=>event===e.event);
	return ['EVAL', COUNT_SCRIPT, 5, countsKey(dayOf(at)), charactersKey(dayOf(at)),
		`loa-sim:stats:receipt:${id || 'legacy'}`, `loa-sim:stats:rate:${rate}`, SINCE_KEY,
		id, character, JSON.stringify(fields), exploration ? dayOf(at) : '', address ? 'limited' : 'trusted'];
}

export async function record(e: CountEvent, fetchFn: typeof fetch, at = Date.now(), address?: string): Promise<'accepted' | 'limited'> {
	if (!redisConfig()) throw new Error('Stats storage is unavailable.');
	const result = await command(recordCommand(e, at, address), fetchFn, 2_000);
	if (result === -1) return 'limited';
	if (result !== 0 && result !== 1) throw new Error('Stats storage returned an unexpected result.');
	return 'accepted';
}

/** One network round trip per batch. Each event's script is atomic; retries safely finish partial batches. */
export async function recordBatch(events: CountEvent[], fetchFn: typeof fetch, at: number, address: string) {
	if (!redisConfig()) throw new Error('Stats storage is unavailable.');
	const results = await pipeline(events.map(e => recordCommand(e, at, address)), fetchFn, 2_000);
	if (results.length !== events.length || results.some(r => r !== 0 && r !== 1 && r !== -1)) throw new Error('Invalid stats receipt.');
	return results.includes(-1) ? 'limited' : 'accepted';
}

export async function count(e: CountEvent, fetchFn: typeof fetch, at = Date.now()): Promise<void> {
	if (!statsEnabled()) return;
	try { await record(e, fetchFn, at); }
	catch { /* Product actions must succeed when optional telemetry is unavailable. */ }
}

export const isBot = (userAgent: string | null) =>
	!userAgent || /bot|crawl|spider|preview|embed|facebookexternalhit|slack|whatsapp|telegram|discord/i.test(userAgent);

export async function readStats(days: number, fetchFn: typeof fetch, now = Date.now()): Promise<StatsReport> {
	if (!Number.isInteger(days) || days < 1 || days > MAX_STATS_DAYS) throw new Error('Invalid stats range.');
	const dates: string[] = [];
	for (let i = 0; i < days; i++) {
		const day = dayOf(now - i * 86_400_000);
		if (day < STATS_START) break;
		dates.push(day);
	}
	if (!dates.length) dates.push(dayOf(now));
	const commands = [...dates.map(d => ['HGETALL', countsKey(d)]), ...dates.map(d => ['PFCOUNT', charactersKey(d)])];
	const results: unknown[] = [];
	// Bound Redis REST pipeline requests as the history grows.
	for (let i = 0; i < commands.length; i += 100) results.push(...await pipeline(commands.slice(i, i + 100), fetchFn));
	const [distinct, since] = await pipeline([['PFCOUNT', ...dates.map(charactersKey)], ['GET', SINCE_KEY]], fetchFn);
	const totals: Record<string, number> = {};
	const out = dates.map((date, i): StatsDay => {
		const flat = Array.isArray(results[i]) ? results[i] as string[] : [];
		const counts: Record<string, number> = {};
		for (let j = 0; j + 1 < flat.length; j += 2) {
			const n = Number(flat[j + 1]);
			if (!Number.isSafeInteger(n) || n < 0) continue;
			counts[flat[j]] = n;
			totals[flat[j]] = (totals[flat[j]] ?? 0) + n;
		}
		return { date, distinctCharacters: Number(results[dates.length + i]) || 0, counts };
	});
	return { from: dates.at(-1)!, to: dates[0], distinctCharacters: Number(distinct) || 0, totals,
		days: out, updatedAt: new Date(now).toISOString(), explorationSince: typeof since === 'string' ? since : null };
}
