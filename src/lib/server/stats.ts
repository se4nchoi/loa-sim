// Cookie-free usage counters in Redis: one hash of counts per UTC day, plus a HyperLogLog of distinct characters
// loaded that day (hashed, so names are never stored). Kept forever: a year is ~1-5 MB. Unions of the daily
// HyperLogLogs give distinct characters over any range, so weekly/monthly/all-time keys aren't needed.
import { createHash } from 'node:crypto';
import { REGIONS } from '$lib/bible-data';
import { classKeyFromName, className } from '$lib/upgrade-planner/class-names';
import { pipeline, redisConfig } from './redis';

/** The first day counted; `days=all` reads from here. */
export const STATS_START = '2026-10-20';
export const MAX_STATS_DAYS = 3660;
const CLIENT_EVENTS = ['lookup', 'lookup_fail', 'sim_open', 'build_saved'] as const;
type ClientEvent = (typeof CLIENT_EVENTS)[number];
export type StatsEvent = ClientEvent | 'share_created' | 'share_opened';
export interface CountEvent { event: StatsEvent; region?: string; name?: string; class?: string }

const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10);
const countsKey = (day: string) => `loa-sim:stats:${day}`;
const charactersKey = (day: string) => `loa-sim:stats:characters:${day}`;

/** A browser-sent event, validated so callers can only bump a fixed set of fields. */
export function cleanEvent(body: unknown): CountEvent | null {
	if (!body || typeof body !== 'object') return null;
	const { event, region, name, class: cls } = body as Record<string, unknown>;
	if (!(CLIENT_EVENTS as readonly unknown[]).includes(event)) return null;
	const out: CountEvent = { event: event as ClientEvent };
	if (event === 'lookup' || event === 'lookup_fail') {
		const r = typeof region === 'string' ? region.toUpperCase() : '';
		if (!(REGIONS as readonly string[]).includes(r)) return null;
		out.region = r;
	}
	if (event === 'lookup') {
		if (typeof name !== 'string' || !/^[^/?#\s]{1,40}$/u.test(name.trim())) return null;
		out.name = name.trim();
		// bible's class id; counted under its NA name when known, otherwise as "Other".
		if (typeof cls === 'string' && cls.length <= 40) out.class = cls;
	}
	return out;
}

function commandsFor(e: CountEvent, at: number): (string | number)[][] {
	const key = countsKey(dayOf(at));
	const cmds: (string | number)[][] = [['HINCRBY', key, e.event, 1]];
	if (e.region) cmds.push(['HINCRBY', key, `${e.event}:${e.region}`, 1]);
	if (e.event === 'lookup') {
		const name = e.class ? className(e.class) : '';
		cmds.push(['HINCRBY', key, `class:${name && classKeyFromName(name) ? name : 'Other'}`, 1]);
		if (e.region && e.name) {
			const id = createHash('sha256').update(`${e.region}/${e.name}`.toLowerCase()).digest('hex').slice(0, 16);
			cmds.push(['PFADD', charactersKey(dayOf(at)), id]);
		}
	}
	return cmds;
}

/** Counts one event. Never throws or holds a page up for long: stats are best-effort. */
export async function count(e: CountEvent, fetchFn: typeof fetch, at = Date.now()): Promise<void> {
	if (!redisConfig()) return;
	try { await pipeline(commandsFor(e, at), fetchFn, 2_000); }
	catch { /* stats are best-effort */ }
}

/** Link previews (Discord, Slack, …) fetch shared pages too; they aren't people opening them. */
export const isBot = (userAgent: string | null) =>
	!userAgent || /bot|crawl|spider|preview|embed|facebookexternalhit|slack|whatsapp|telegram|discord/i.test(userAgent);

export interface StatsDay { date: string; distinctCharacters: number; counts: Record<string, number> }
export interface StatsReport { from: string; to: string; distinctCharacters: number; totals: Record<string, number>; days: StatsDay[] }

/** The last `days` days (newest first, not before STATS_START), with totals and distinct characters over the range. */
export async function readStats(days: number, fetchFn: typeof fetch, now = Date.now()): Promise<StatsReport> {
	const dates: string[] = [];
	for (let i = 0; i < Math.min(days, MAX_STATS_DAYS); i++) {
		const d = dayOf(now - i * 86_400_000);
		if (d < STATS_START) break;
		dates.push(d);
	}
	if (!dates.length) dates.push(dayOf(now));
	const results = await pipeline([
		...dates.map((d) => ['HGETALL', countsKey(d)]),
		...dates.map((d) => ['PFCOUNT', charactersKey(d)]),
		['PFCOUNT', ...dates.map(charactersKey)]
	], fetchFn);
	const totals: Record<string, number> = {};
	const out = dates.map((date, i): StatsDay => {
		const flat = Array.isArray(results[i]) ? (results[i] as string[]) : [];
		const counts: Record<string, number> = {};
		for (let j = 0; j + 1 < flat.length; j += 2) {
			const n = Number(flat[j + 1]) || 0;
			counts[flat[j]] = n;
			totals[flat[j]] = (totals[flat[j]] ?? 0) + n;
		}
		return { date, distinctCharacters: Number(results[dates.length + i]) || 0, counts };
	});
	const sorted = Object.fromEntries(Object.entries(totals).sort(([a], [b]) => a.localeCompare(b)));
	return { from: dates.at(-1)!, to: dates[0], distinctCharacters: Number(results.at(-1)) || 0, totals: sorted, days: out };
}
