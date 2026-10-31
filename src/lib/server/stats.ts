// Validated, anonymous usage observations. Redis is reserved for simulation sharing.
import { createHash, randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { REGIONS } from '$lib/bible-data';
import { CP_BUCKETS, LEVEL_BUCKETS, LEVEL_MILESTONES, PLAN_SECTIONS, type PlanObservation } from '$lib/plan-stats';
import { cleanInsight, insightFields } from '$lib/stats-insights';
import { isCpStatsModel } from '$lib/stats-versions';
import { cleanSampling, samplingFields } from '$lib/stats-sampling';
import { EXPLORATION_EVENTS, UPGRADE_CATEGORIES, type CountEvent, type StatsDay, type StatsReport } from '$lib/stats-model';
import { className, resolveClass } from '$lib/upgrade-planner/class-names';
import { statsQuery, statsConfigured } from './stats-postgres';
export type { CountEvent, StatsDay, StatsReport } from '$lib/stats-model';

export const STATS_START = '2026-10-20';
export const MAX_STATS_DAYS = 3660;
const CLIENT_EVENTS = ['lookup', 'lookup_fail', 'sim_open', 'build_saved', ...EXPLORATION_EVENTS.map(([event])=>event)];
const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10);
export const statsEnabled = () => !env.VERCEL_ENV || env.VERCEL_ENV === 'production';

export function cleanEvent(body: unknown): CountEvent | null {
	if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
	const { event, region, name, class: cls, id, source, category, plan, insight, sampling, v } = body as Record<string, unknown>;
	if (typeof event !== 'string' || !CLIENT_EVENTS.includes(event)) return null;
	const out: CountEvent = { event: event as CountEvent['event'] };
	if (v!==undefined) { if(v!==2 && v!==3) return null; out.v=v; }
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
		if(p.model!==undefined){if(!isCpStatsModel(p.model))return null;out.plan.model=p.model;}
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
		const sample=cleanInsight(insight,UPGRADE_CATEGORIES,v===3?3:2);
		if(!sample || !out.id || (v!==2 && v!==3))return null;
		const inline=v===3 && ((event==='upgrade_applied' && sample.kind==='decision' && sample.chosen===category) ||
			(event==='budget_closed' && sample.kind==='budget'));
		if(`${sample.kind}_sampled`!==event && !inline)return null;
		out.insight=sample;
	} else if (['opportunity_sampled','budget_sampled','decision_sampled'].includes(event)) return null;
	if (sampling!==undefined) {
		const attempt=cleanSampling(sampling);
		if(!attempt || v!==3 || !out.id)return null;
		const expected=event==='build_saved'?'plan':event==='upgrade_applied'?'decision':
			['budget_closed','budget_abandoned'].includes(event)?'budget':
			event==='opportunity_sampled'||event==='sample_skipped'?'opportunity':undefined;
		if(attempt.kind!==expected)return null;
		const sample=out.insight??out.plan;
		if(attempt.reason ? !!sample : !sample)return null;
		if(out.insight && attempt.model!==out.insight.cohort.model)return null;
		if(out.plan && attempt.model!==out.plan.model)return null;
		if(event==='sample_skipped'&&!attempt.reason)return null;
		if(event==='budget_abandoned'&&attempt.reason!=='unmounted')return null;
		out.sampling=attempt;
	}
	if(v===3 && ['build_saved','upgrade_applied','budget_closed','budget_abandoned','opportunity_sampled','sample_skipped'].includes(event) && !out.sampling)return null;
	if(['budget_closed','budget_abandoned','sample_skipped'].includes(event) && v!==3)return null;
	if(v===3 && ['decision_sampled','budget_sampled'].includes(event))return null;
	return out;
}

/** Expand only bounded, validated dimensions; never persist names, raw addresses or arbitrary payloads. */
export function observation(e: CountEvent, at: number) {
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
	if(e.plan?.model)fields.push(`plan:model:${e.plan.model}`);
	if (e.plan?.start) fields.push(`plan:progression:${e.plan.model??'legacy'}:${e.plan.region??'unknown'}:${e.plan.classId??'unknown'}:${e.plan.role}:${e.plan.start}:${e.plan.target}`,`plan:headroom:${e.plan.model??'legacy'}:${e.plan.region??'unknown'}:${e.plan.classId??'unknown'}:${e.plan.role}:${e.plan.start}:${e.plan.cp}`);
	for (const section of e.plan?.sections??[]) fields.push(`plan:section:${section}`);
	for (const milestone of e.plan?.milestones??[]) fields.push(`plan:milestone:${milestone}`);
	for(const key of ['dominant','shape','weapon','gems'] as const) if(e.plan?.[key]) fields.push(`plan:${key}:${e.plan[key]}`);
	if(e.insight) {
		fields.push(...insightFields(e.insight,e.v===3?3:2));
		if(e.event==='upgrade_applied'||e.event==='budget_closed')fields.push(`${e.insight.kind}_sampled`);
	}
	if(e.sampling)fields.push(...samplingFields(e.sampling));
	const hash = (s: string) => createHash('sha256').update(s).digest('hex');
	const character = e.event === 'lookup' && e.region && e.name ? hash(`${e.region}/${e.name}`.toLowerCase()).slice(0, 16) : '';
	return {id: hash(e.id ?? randomUUID()), at: new Date(at).toISOString(), day: dayOf(at), fields,
		character, exploration: EXPLORATION_EVENTS.some(([event])=>event===e.event),
		sample: e.insight ?? e.plan ?? null, sampling: e.sampling ?? null, version: e.v ?? 1};
}

/** One atomic SQL call per batch, including receipts and rate limiting. No Redis fallback. */
export async function recordBatch(events: CountEvent[], _fetch: typeof fetch, at: number, address?: string): Promise<'accepted' | 'limited'> {
	if (!statsConfigured()) throw new Error('Stats storage is unavailable.');
	if (!events.length || events.length > 16) throw new Error('Invalid stats batch.');
	const rate = address ? createHash('sha256').update(address).digest('hex') : null;
	const rows = await statsQuery('SELECT loa_stats_ingest($1::jsonb, $2::text, $3::timestamptz) AS status',
		[JSON.stringify(events.map(e => observation(e, at))), rate, new Date(at).toISOString()], 4_000);
	const status = rows[0]?.status;
	if (status !== 'accepted' && status !== 'limited') throw new Error('Invalid stats receipt.');
	return status;
}

export async function record(e: CountEvent, fetchFn: typeof fetch, at = Date.now(), address?: string) {
	return recordBatch([e], fetchFn, at, address);
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
	const rows = await statsQuery(`SELECT loa_stats_report($1::date, $2::date) AS report`, [dates.at(-1), dates[0]]);
	const data = rows[0]?.report as {counts: {day: string; field: string; value: number}[]; characters: {day: string; value: number}[];
		distinct: number; since: string | null; legacy: boolean} | undefined;
	if (!data || !Array.isArray(data.counts) || !Array.isArray(data.characters)) throw new Error('Invalid stats report.');
	const totals: Record<string, number> = {};
	const out: StatsDay[] = dates.map(date => ({date, distinctCharacters: 0, counts: {}}));
	const byDate = new Map(out.map(d => [d.date, d]));
	for (const row of data.counts) {
		const day = byDate.get(row.day), n = Number(row.value);
		if (!day || !Number.isSafeInteger(n) || n < 0) throw new Error('Invalid stats counter.');
		day.counts[row.field] = n;
		totals[row.field] = (totals[row.field] ?? 0) + n;
	}
	for (const row of data.characters) {
		const day = byDate.get(row.day);
		if (day) day.distinctCharacters = Number(row.value);
	}
	return {from: dates.at(-1)!, to: dates[0], distinctCharacters: Number(data.distinct), totals, days: out,
		updatedAt: new Date(now).toISOString(), explorationSince: data.since,
		...(data.legacy ? {legacyDistinct: true} : {})};
}
