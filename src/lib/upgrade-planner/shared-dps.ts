// A DPS build shared by link: the gear edits (the shared simulation) plus the one run they were measured on, so whoever
// opens the link sees the same Recorded → Simulated. Only the sharer's own run goes along: their skills' damage, the
// fight's length and outcome, the party's damage total. No other player's name or numbers are in a RunSummary.
import type { RunSkill, RunSummary } from '$lib/logs/protocol';
import type { SimState } from './simulate';

export interface SharedDps {
	run: RunSummary;
	/** The meter's baseline: the gear the run was played with (or the loaded gear the sharer confirmed). */
	baseline: SimState;
	/** Name and icon of the run's skills. */
	skills: Record<number, [name: string, icon: string]>;
	/** The run's skills with their tripods, for Ark Grid effects that need a tripod; absent without a snapshot. */
	arkSkills?: { id: number; tripods?: number[] }[];
	/** The sharer marked this wipe as an enrage. */
	enrage?: boolean;
}

const MAX_SKILLS = 200;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const text = (s: unknown, max = 120): s is string => typeof s === 'string' && s.length <= max;
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
/** Numbers keyed by ids: buffs, buff names. */
const idMap = (x: unknown, value: (v: unknown) => boolean) =>
	record(x) && Object.keys(x).length <= MAX_SKILLS && Object.entries(x).every(([k, v]) => /^\d{1,10}$/.test(k) && value(v));
/** Icon paths are drawn as images from our icon host, so only plain path characters pass. */
const icon = (s: unknown) => text(s) && /^[\w./-]*$/.test(s);

function skill(s: unknown): s is RunSkill {
	if (!record(s)) return false;
	const optional = (k: string) => s[k] === undefined || finite(s[k]);
	return finite(s.id) && finite(s.damage) && finite(s.critDamage) && finite(s.hits) && finite(s.crits) && finite(s.casts) &&
		['timeAvailable', 'damageGem', 'cooldownGem', 'front', 'back'].every(optional) &&
		(s.hyper === undefined || typeof s.hyper === 'boolean') && (s.buffs === undefined || idMap(s.buffs, finite));
}

function run(r: unknown): r is RunSummary {
	if (!record(r)) return false;
	const nullableNumber = (v: unknown) => v === null || finite(v);
	const pair = (v: unknown, a: string, b: string) => record(v) && finite(v[a]) && finite(v[b]);
	return finite(r.id) && finite(r.start) && text(r.boss) && text(r.difficulty, 40) && (r.cleared === null || typeof r.cleared === 'boolean') &&
		text(r.player, 40) && finite(r.duration) && r.duration > 0 && finite(r.damage) && r.damage > 0 &&
		nullableNumber(r.combatPower) && nullableNumber(r.itemLevel) && (r.spec === null || text(r.spec, 60)) &&
		Array.isArray(r.engravings) && r.engravings.length <= 20 && r.engravings.every((e) => text(e, 60)) &&
		Array.isArray(r.skills) && r.skills.length <= MAX_SKILLS && r.skills.every(skill) &&
		(r.statValues === null || idMapLike(r.statValues)) && typeof r.critConversion === 'boolean' && (r.meterVersion === null || text(r.meterVersion, 40)) &&
		(r.loadoutHash === undefined || text(r.loadoutHash, 80)) && (r.buffNames === undefined || idMap(r.buffNames, (v) => text(v))) &&
		(r.bossHp === undefined || pair(r.bossHp, 'left', 'max')) && (r.dead === undefined || pair(r.dead, 'count', 'of')) &&
		(r.partyDamage === undefined || finite(r.partyDamage)) &&
		(r.arkGridOrder === undefined || (record(r.arkGridOrder) && Object.values(r.arkGridOrder).every(finite))) &&
		(r.arkPassives === undefined || (record(r.arkPassives) && Object.values(r.arkPassives).every((list) => Array.isArray(list) && list.length <= 100 && list.every((p) => pair(p, 'id', 'lv')))));
}
/** Numbers, nested at most `depth` levels in records or lists (statRanges: stat → min / max). */
const numbers = (x: unknown, depth: number): boolean => finite(x) || (depth > 0 && (Array.isArray(x) || record(x)) &&
	Object.keys(x as object).length <= 500 && Object.values(x as object).every((v) => numbers(v, depth - 1)));
/** The meter's stat values: numbers, sample counts by stat, min / max by stat, the encounter ids. */
const idMapLike = (x: unknown) => record(x) && numbers(x, 3);

/**
 * A run as a share link carries it: only what the meter reads. Left out: the party's damage and deaths (other players'
 * part, and a support's per-dealer split), the public log's id (it names the whole party), the local log's id, the fight's time of day (the date stays,
 * at noon UTC), the meter version and the lostark.bible snapshot hash.
 */
export function shareableRun(run: RunSummary): RunSummary {
	const { partyDamage: _party, dead: _dead, loadoutHash: _hash, upstreamId: _log, support: _support, ...rest } = run;
	return { ...rest, id: 0, start: Math.floor(run.start / 86_400_000) * 86_400_000 + 43_200_000, meterVersion: null };
}

/**
 * A shared run from untrusted JSON, or null when it isn't one. Its run is cut down to `shareableRun`, whatever was sent. `checkBaseline` validates the baseline gear (the shared
 * simulation's own parser does it on the server) and returns it normalized.
 */
export function parseSharedDps(x: unknown, checkBaseline: (state: unknown) => SimState): SharedDps | null {
	if (!record(x) || !run(x.run)) return null;
	if (!record(x.skills) || !idMap(x.skills, (v) => Array.isArray(v) && v.length === 2 && text(v[0]) && icon(v[1]))) return null;
	if (x.arkSkills !== undefined && !(Array.isArray(x.arkSkills) && x.arkSkills.length <= MAX_SKILLS &&
		x.arkSkills.every((s) => record(s) && finite(s.id) && (s.tripods === undefined || (Array.isArray(s.tripods) && s.tripods.length <= 10 && s.tripods.every(finite)))))) return null;
	if (x.enrage !== undefined && typeof x.enrage !== 'boolean') return null;
	let baseline: SimState;
	try { baseline = checkBaseline(x.baseline); } catch { return null; }
	return { run: shareableRun(x.run), baseline, skills: x.skills as SharedDps['skills'], ...(x.arkSkills ? { arkSkills: x.arkSkills as SharedDps['arkSkills'] } : {}), ...(x.enrage ? { enrage: true } : {}) };
}
