// Validated, anonymous usage observations, stored in Cloudflare D1 (migrations/d1). Neon keeps only shared builds,
// so ordinary visits no longer wake its compute.
import { createHash, randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { REGIONS } from '$lib/bible-data';
import { CP_BUCKETS, LEVEL_BUCKETS, LEVEL_MILESTONES, PLAN_SECTIONS, type PlanObservation } from '$lib/plan-stats';
import { cleanInsight, insightFields } from '$lib/stats-insights';
import { isCpStatsModel } from '$lib/stats-versions';
import { cleanSampling, samplingFields } from '$lib/stats-sampling';
import { EXPLORATION_EVENTS, UPGRADE_CATEGORIES, type CountEvent, type StatsDay, type StatsReport } from '$lib/stats-model';
import { className, resolveClass } from '$lib/upgrade-planner/class-names';
import { COMPACT_FROM, compactFields, expandCounts } from '$lib/stats-compact';
import { EFFICIENCY_BUCKETS, POWER_BUCKETS, VISIT_CHARACTER_BUCKETS, VISIT_UPGRADE_BUCKETS, isKey } from '$lib/fun-stats';
import type { D1Database } from './d1';
export type { CountEvent, StatsDay, StatsReport } from '$lib/stats-model';

export const STATS_START = '2026-10-20';
export const MAX_STATS_DAYS = 3660;
const CLIENT_EVENTS = ['lookup', 'lookup_fail', 'sim_open', 'build_saved', 'visit_end', ...EXPLORATION_EVENTS.map(([event])=>event)];
const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10);
/** DEPLOY_ENV is set per Cloudflare Pages environment (production / preview); unset counts. */
export const statsEnabled = () => !env.DEPLOY_ENV || env.DEPLOY_ENV === 'production';

export function cleanEvent(body: unknown): CountEvent | null {
	if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
	const { event, region, name, class: cls, id, source, category, plan, insight, sampling, v, level, power, role, efficiency, upgrades, characters } = body as Record<string, unknown>;
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
	// Fun-facts ranges: only on the event they describe, only as known range keys.
	if (level !== undefined) { if (event !== 'lookup' || !LEVEL_BUCKETS.some(([k]) => k === level)) return null; out.level = level as CountEvent['level']; }
	if (power !== undefined || role !== undefined) {
		if (event !== 'lookup' || !isKey(POWER_BUCKETS, power) || (role !== 'dealer' && role !== 'support')) return null;
		out.power = power; out.role = role;
	}
	if (efficiency !== undefined) { if (event !== 'upgrade_applied' || !isKey(EFFICIENCY_BUCKETS, efficiency)) return null; out.efficiency = efficiency; }
	if (event === 'visit_end') {
		if (!isKey(VISIT_UPGRADE_BUCKETS, upgrades) || !isKey(VISIT_CHARACTER_BUCKETS, characters)) return null;
		out.upgrades = upgrades; out.characters = characters;
	} else if (upgrades !== undefined || characters !== undefined) return null;
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
		fields.push(`hour:${new Date(at).getUTCHours().toString().padStart(2, '0')}`);
		if (e.level) fields.push(`level:${e.level}`, `level:class:${cls ? className(cls) : 'Unknown'}:${e.level}`);
		if (e.power && e.role) fields.push(`power:${e.role}:${e.power}`);
	}
	if (e.efficiency) fields.push(`efficiency:${e.efficiency}`, `efficiency:${e.category}:${e.efficiency}`);
	if (e.event === 'visit_end') fields.push(`visit:upgrades:${e.upgrades}`, `visit:characters:${e.characters}`);
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
	const day = dayOf(at);
	return {id: hash(e.id ?? randomUUID()), at: new Date(at).toISOString(), day, fields: day >= COMPACT_FROM ? compactFields(fields) : fields,
		character, exploration: EXPLORATION_EVENTS.some(([event])=>event===e.event),
		sample: e.insight ?? e.plan ?? null, sampling: e.sampling ?? null, version: e.v ?? 1};
}

const RATE_LIMIT = 120;
const RETAIN_EVENTS_MS = 90 * 86_400_000;

/**
 * Stores a batch in D1: one read for retry receipts, then one transaction for the limiter, the events and
 * maintenance. Counters come from a trigger on actual inserts, so duplicate IDs never count twice, even when
 * two submissions race. No Postgres or Redis fallback.
 */
export async function recordBatch(events: CountEvent[], db: D1Database | undefined, at: number, address?: string): Promise<'accepted' | 'limited'> {
	if (!db) throw new Error('Stats storage is unavailable.');
	if (!events.length || events.length > 16) throw new Error('Invalid stats batch.');
	const unique = [...new Map(events.map(e => observation(e, at)).map(o => [o.id, o])).values()];
	const placeholders = unique.map(() => '?').join(',');
	const [receipts, cleanup] = await db.batch<{id?: string; value?: string}>([
		db.prepare(`SELECT id FROM loa_stats_events WHERE id IN (${placeholders})`).bind(...unique.map(o => o.id)),
		db.prepare(`SELECT value FROM loa_stats_meta WHERE key = 'cleanup-day'`),
	]);
	const known = new Set(receipts.results.map(r => r.id));
	const pending = unique.filter(o => !known.has(o.id));
	// Duplicate retries consume no allowance.
	if (!pending.length) return 'accepted';
	const rate = address ? createHash('sha256').update(address).digest('hex') : '';
	const bucket = new Date(Math.floor(at / 60_000) * 60_000).toISOString();
	const statements = [];
	if (rate) statements.push(db.prepare(`INSERT INTO loa_stats_rates (subject_hash, bucket, hits) VALUES (?1, ?2, ?3)
		ON CONFLICT (subject_hash, bucket) DO UPDATE SET hits = min(${RATE_LIMIT + 1}, hits + excluded.hits) RETURNING hits`)
		.bind(rate, bucket, pending.length));
	for (const o of pending) statements.push(db.prepare(`INSERT INTO loa_stats_events
		(id, occurred_at, day, character_hash, fields, sample, sampling, version, exploration)
		SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9
		WHERE NOT EXISTS (SELECT 1 FROM loa_stats_rates WHERE subject_hash = ?10 AND bucket = ?11 AND hits > ${RATE_LIMIT})
		ON CONFLICT (id) DO NOTHING`).bind(o.id, o.at, o.day, o.character, JSON.stringify(o.fields),
		o.sample ? JSON.stringify(o.sample) : null, o.sampling ? JSON.stringify(o.sampling) : null,
		o.version, o.exploration ? 1 : 0, rate, bucket));
	// Keep summaries, but bound detailed observations to 90 days. Once per UTC day (the first batch after midnight),
	// because each deleted row and index entry counts as a D1 row written. Limiter buckets go at the same time.
	const today = dayOf(at);
	if ((cleanup?.results[0]?.value ?? '') < today) statements.push(
		db.prepare(`INSERT INTO loa_stats_meta (key, value) VALUES ('cleanup-day', ?1) ON CONFLICT (key) DO UPDATE SET value = excluded.value`).bind(today),
		db.prepare('DELETE FROM loa_stats_events WHERE occurred_at < ?').bind(new Date(at - RETAIN_EVENTS_MS).toISOString()),
		db.prepare('DELETE FROM loa_stats_rates WHERE bucket < ?').bind(new Date(at - 120_000).toISOString()));
	const results = await db.batch<{hits: number}>(statements);
	return rate && Number(results[0]?.results[0]?.hits) > RATE_LIMIT ? 'limited' : 'accepted';
}

export async function record(e: CountEvent, db: D1Database | undefined, at = Date.now(), address?: string) {
	return recordBatch([e], db, at, address);
}

export async function count(e: CountEvent, db: D1Database | undefined, at = Date.now()): Promise<void> {
	if (!statsEnabled()) return;
	try { await record(e, db, at); }
	catch { /* Product actions must succeed when optional telemetry is unavailable. */ }
}

export const isBot = (userAgent: string | null) =>
	!userAgent || /bot|crawl|spider|preview|embed|facebookexternalhit|slack|whatsapp|telegram|discord/i.test(userAgent);

export async function readStats(days: number, db: D1Database | undefined, now = Date.now()): Promise<StatsReport> {
	if (!db) throw new Error('Stats storage is unavailable.');
	if (!Number.isInteger(days) || days < 1 || days > MAX_STATS_DAYS) throw new Error('Invalid stats range.');
	const dates: string[] = [];
	for (let i = 0; i < days; i++) {
		const day = dayOf(now - i * 86_400_000);
		if (day < STATS_START) break;
		dates.push(day);
	}
	if (!dates.length) dates.push(dayOf(now));
	// One snapshot: counters plus imported Redis summaries, which stay in their own tables.
	const [counts, characters, summary] = await db.batch([
		db.prepare(`SELECT day, field, sum(value) AS value FROM (
			SELECT day, field, value FROM loa_stats_counters WHERE day BETWEEN ?1 AND ?2
			UNION ALL SELECT d.day, c.key, CAST(c.value AS INTEGER) FROM loa_stats_legacy_days d, json_each(d.counts) c
				WHERE d.day BETWEEN ?1 AND ?2
		) GROUP BY day, field`).bind(dates.at(-1), dates[0]),
		db.prepare(`SELECT day, sum(value) AS value FROM (
			SELECT day, count(*) AS value FROM loa_stats_characters WHERE day BETWEEN ?1 AND ?2 GROUP BY day
			UNION ALL SELECT day, characters FROM loa_stats_legacy_days WHERE day BETWEEN ?1 AND ?2
		) GROUP BY day`).bind(dates.at(-1), dates[0]),
		db.prepare(`SELECT
			(SELECT count(DISTINCT character_hash) FROM loa_stats_characters WHERE day BETWEEN ?1 AND ?2)
			+ coalesce((SELECT r.characters FROM loa_stats_legacy_ranges r,
				(SELECT min(day) AS first, max(day) AS last FROM loa_stats_legacy_days WHERE day BETWEEN ?1 AND ?2) l
				WHERE r.first_day = l.first AND r.last_day = l.last), 0) AS distinct_count,
			EXISTS (SELECT 1 FROM loa_stats_legacy_days WHERE day BETWEEN ?1 AND ?2) AS legacy,
			(SELECT value FROM loa_stats_meta WHERE key = 'exploration-since') AS since,
			(SELECT count(*) FROM (SELECT 1 FROM loa_stats_characters WHERE day BETWEEN ?1 AND ?2
				GROUP BY character_hash HAVING count(*) > 1)) AS returning_count,
			(SELECT coalesce(max(n), 0) FROM (SELECT count(*) AS n FROM loa_stats_characters WHERE day BETWEEN ?1 AND ?2
				GROUP BY character_hash)) AS most_days`).bind(dates.at(-1), dates[0]),
	]);
	const head = summary?.results[0] as {distinct_count: number; legacy: number; since: string | null; returning_count: number; most_days: number} | undefined;
	if (!counts || !characters || !head) throw new Error('Invalid stats report.');
	const data = {counts: counts.results as {day: string; field: string; value: number}[],
		characters: characters.results as {day: string; value: number}[],
		distinct: head.distinct_count, since: head.since, legacy: !!head.legacy};
	const totals: Record<string, number> = {};
	const out: StatsDay[] = dates.map(date => ({date, distinctCharacters: 0, counts: {}}));
	const byDate = new Map(out.map(d => [d.date, d]));
	for (const row of data.counts) {
		const day = byDate.get(row.day), n = Number(row.value);
		if (!day || !Number.isSafeInteger(n) || n < 0) throw new Error('Invalid stats counter.');
		day.counts[row.field] = n;
	}
	for (const day of out) {
		if (day.date >= COMPACT_FROM) expandCounts(day.counts);
		for (const [field, n] of Object.entries(day.counts)) totals[field] = (totals[field] ?? 0) + n;
	}
	for (const row of data.characters) {
		const day = byDate.get(row.day);
		if (day) day.distinctCharacters = Number(row.value);
	}
	return {from: dates.at(-1)!, to: dates[0], distinctCharacters: Number(data.distinct), totals, days: out,
		updatedAt: new Date(now).toISOString(), explorationSince: data.since,
		returningCharacters: Number(head.returning_count), mostDaysOneCharacter: Number(head.most_days),
		...(data.legacy ? {legacyDistinct: true} : {})};
}
