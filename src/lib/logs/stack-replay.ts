// Stacks an Order core builds and spends, replayed from a run's casts. The core text says "Damage +4% per stack (max 50),
// consumed on Napalm Shot", but a Napalm Shot can go out at 12 stacks; valuing every cast at 50 overstates the core.
// The logs keep every cast and hit with its time and the player's buffs, so each spending cast's stacks can be counted
// from what happened before it. Only cores the run was played on matter (the meter doesn't value core swaps), so their
// Destiny windows are in the logs too.
//
// A rule only counts when the run shows it working: its window buff (if any) is in the run and at least one stack was
// gained. Otherwise the meter keeps the core's max-stacks assumption and says so.
import { SKILL_GROUPS } from '$lib/upgrade-planner/skill-groups';

export interface StackRule {
	/** Order core class and name, as in ORDER_CORES. */
	cls: string;
	core: string;
	/** What adds stacks: these skills' casts or hits (by name, or by the class's skill groups; `all`: every skill). */
	from: { skills?: string[]; groups?: string[]; all?: true; except?: string[] };
	per: 'cast' | 'hit';
	/** Stacks per gain (default 1); `chance` makes it an expected count. */
	add?: number;
	chance?: number;
	/** At most one gain per this many ms. */
	gapMs?: number;
	cap: number;
	/** The skills the bonus is on (names or groups). */
	on: { skills?: string[]; groups?: string[] };
	/** The bonus's cast spends all stacks. */
	consumed: boolean;
	/** Stacks end after this cast ("When Inferno Burst ends, Incarnation Mode also ends"). */
	resetAfter?: string[];
	/** Gains only while this buff is on the player; stacks end with it unless `outlasts`. */
	while?: string;
	outlasts?: true;
	/** Stacks end this long after the last gain. */
	lastsMs?: number;
}

const DESTINY = (name: string) => `Destiny: ${name}`;
export const STACK_RULES: StackRule[] = [
	{ cls: 'blade', core: 'Slaughter Spectacle', from: { groups: ['Normal'], except: ['Deathly Slash'] }, per: 'cast', cap: 5,
		on: { skills: ['Deathly Slash'] }, consumed: true, while: DESTINY('Slaughter Spectacle') },
	{ cls: 'blaster', core: 'Demon Fire', from: { skills: ['Flamethrower'] }, per: 'hit', cap: 50,
		on: { skills: ['Napalm Shot'] }, consumed: true, while: DESTINY('Demon Fire') },
	{ cls: 'devilhunter', core: 'Hidden Fang', from: { groups: ['Handgun'], except: ['Secret Weapon'] }, per: 'hit', cap: 20,
		on: { skills: ['Secret Weapon'] }, consumed: true, while: DESTINY('Hidden Fang') },
	{ cls: 'devilhunter_female', core: 'Lawless Land', from: { groups: ['Handgun'], except: ['Bullet Rain'] }, per: 'cast', cap: 20,
		on: { skills: ['Bullet Rain'] }, consumed: true, while: DESTINY('Lawless'), outlasts: true, lastsMs: 30_000 },
	{ cls: 'hawkeye', core: 'TA-64 Reaper Bolt', from: { skills: ['Silverhawk Basic Attack'] }, per: 'hit', chance: 0.5, cap: 20,
		on: { skills: ['Charged Shot'] }, consumed: true, while: DESTINY('Compounding Draw') },
	{ cls: 'warlord', core: 'Thunder', from: { skills: ['Leap Attack'] }, per: 'hit', add: 2, gapMs: 500, cap: 10,
		on: { skills: ["Guardian's Thundercrack"] }, consumed: true, while: DESTINY('Electric Charge') },
	{ cls: 'scouter', core: 'SMG Agent', from: { skills: ['Strategic Fire', 'Avalanche'] }, per: 'cast', cap: 5,
		on: { skills: ['Annihilation Mode'] }, consumed: true, while: DESTINY('SMG Agent') },
	{ cls: 'scouter', core: 'Titan Suit', from: { skills: ['Laser Blade', 'Surge Blow'] }, per: 'cast', cap: 4,
		on: { skills: ['Sonic Impact'] }, consumed: true, while: DESTINY('Titan Suit'), outlasts: true, lastsMs: 60_000 },
	{ cls: 'battlemaster_male', core: 'Utter Carnage', from: { all: true, except: ['Berserk Circle', 'Basic Attack'] }, per: 'cast', cap: 3,
		on: { skills: ['Berserk Circle'] }, consumed: true, while: DESTINY('Blast'), outlasts: true, lastsMs: 20_000 },
	{ cls: 'dragonknight', core: 'Manifest', from: { groups: ['Manifestation'] }, per: 'cast', cap: 6,
		on: { skills: ['Inferno Burst', 'Exploding Finisher'] }, consumed: false, resetAfter: ['Inferno Burst'], while: DESTINY('Quintessential') },
	{ cls: 'infighter', core: 'Earth Collapse', from: { groups: ['Stamina'], except: ['Earth Rend'] }, per: 'cast', cap: 3,
		on: { skills: ['Earth Rend'] }, consumed: false, while: DESTINY('Condensed Stamina'), lastsMs: 15_000 }
];
/** Timed "Damage to foes" lines whose window is its own logged buff: each hit counts as 1 stack under it, 0 outside. */
export const BUFF_WINDOWS: { cls: string; core: string; buffs: string[] }[] = [
	{ cls: 'reaper', core: 'Ravening Nightmare', buffs: [DESTINY('Bloodthirst'), DESTINY('Nightmare')] }
];
export const ruleKey = (r: { cls: string; core: string }) => `${r.cls}:${r.core}`;

export interface ReplayHit { timestamp?: number; damage?: number; buffedBy?: number[] }
export interface ReplaySkillLog { id: number; name: string; casts: { timestamp?: number; hits?: ReplayHit[] }[] }
/** Per bonus skill id: damage by the stacks its casts went out with (keys: stacks, one decimal). */
export type StackDamage = Record<number, Record<string, number>>;

const buffActive = (ids: number[] | undefined, window: Set<number>) => !!ids?.some((id) => window.has(id));
/** A logged buff's ids for a Destiny name: the same name, longer ("Destiny: Final" → "Destiny: Final Words"), or bare. */
export function buffIdsNamed(names: Map<number, string>, name: string): Set<number> {
	const bare = name.replace(/^Destiny: /, '');
	return new Set([...names].filter(([, n]) => n === name || n.startsWith(`${name} `) || n === bare).map(([id]) => id));
}

/** One rule on one run; null when the run can't show it (window buff not in the run, or no stack ever gained). */
export function replayStacks(rule: StackRule, skills: ReplaySkillLog[], buffNames: Map<number, string>): StackDamage | null {
	const groups = SKILL_GROUPS[rule.cls] ?? {};
	const matches = (sel: { skills?: string[]; groups?: string[]; all?: true; except?: string[] }, s: ReplaySkillLog) =>
		!sel.except?.includes(s.name) && (!!sel.all || !!sel.skills?.includes(s.name) || !!sel.groups?.some((g) => groups[s.id]?.includes(g)));
	const window = rule.while ? buffIdsNamed(buffNames, rule.while) : null;
	if (window && !window.size) return null;

	type Event = { t: number; kind: 'gain' | 'spend'; skill: ReplaySkillLog; damage: number; buffs?: number[] };
	const events: Event[] = [];
	for (const s of skills) {
		const gains = matches(rule.from, s), spends = matches(rule.on, s);
		if (!gains && !spends && !rule.resetAfter?.includes(s.name)) continue;
		for (const cast of s.casts) {
			const hits = cast.hits ?? [];
			const t = cast.timestamp ?? hits[0]?.timestamp;
			if (t === undefined) continue;
			// A cast that gains is placed before one that spends at the same time (its own hits come after).
			if (spends || rule.resetAfter?.includes(s.name)) events.push({ t, kind: 'spend', skill: s, damage: hits.reduce((d, h) => d + (h.damage ?? 0), 0), buffs: hits[0]?.buffedBy });
			if (!gains) continue;
			if (rule.per === 'cast') events.push({ t, kind: 'gain', skill: s, damage: 0, buffs: hits[0]?.buffedBy });
			else for (const h of hits) if (h.timestamp !== undefined) events.push({ t: h.timestamp, kind: 'gain', skill: s, damage: 0, buffs: h.buffedBy });
		}
	}
	events.sort((a, b) => a.t - b.t || (a.kind === 'gain' ? -1 : 1));

	const out: StackDamage = {};
	let stacks = 0, lastGain = -Infinity, gained = 0;
	for (const e of events) {
		if (rule.lastsMs !== undefined && e.t - lastGain > rule.lastsMs) stacks = 0;
		if (e.kind === 'gain') {
			// A gaining skill outside the window: the window ended, and its stacks with it. Spending casts aren't checked:
			// their hits can land after the cast spent the stacks and ended the window.
			const inWindow = !window || buffActive(e.buffs, window);
			if (!inWindow && !rule.outlasts) stacks = 0;
			if (!inWindow || e.t - lastGain < (rule.gapMs ?? 0)) continue;
			stacks = Math.min(rule.cap, stacks + (rule.add ?? 1) * (rule.chance ?? 1));
			lastGain = e.t;
			gained++;
			continue;
		}
		if (matches(rule.on, e.skill) && e.damage > 0) {
			const key = (Math.round(stacks * 10) / 10).toString();
			(out[e.skill.id] ??= {})[key] = (out[e.skill.id][key] ?? 0) + e.damage;
		}
		if (rule.consumed && matches(rule.on, e.skill) || rule.resetAfter?.includes(e.skill.name)) stacks = 0;
	}
	return gained && Object.keys(out).length ? out : null;
}

/** A buff window on every skill: damage by hits under it (1) or not (0); null when no hit was under it. */
export function replayWindow(buffs: string[], skills: ReplaySkillLog[], buffNames: Map<number, string>): StackDamage | null {
	const ids = new Set(buffs.flatMap((b) => [...buffIdsNamed(buffNames, b)]));
	const out: StackDamage = {};
	let under = 0;
	for (const s of skills) for (const cast of s.casts) for (const h of cast.hits ?? []) {
		if (!h.damage) continue;
		const k = buffActive(h.buffedBy, ids) ? '1' : '0';
		if (k === '1') under++;
		(out[s.id] ??= {})[k] = (out[s.id][k] ?? 0) + h.damage;
	}
	return under ? out : null;
}

/** Every rule whose bonus skills the run used; keyed by ruleKey. */
export function stackReplay(skills: ReplaySkillLog[], buffNames: Map<number, string>): Record<string, StackDamage> | undefined {
	const out: Record<string, StackDamage> = {};
	for (const rule of STACK_RULES) {
		const done = replayStacks(rule, skills, buffNames);
		if (done) out[ruleKey(rule)] = done;
	}
	for (const w of BUFF_WINDOWS) {
		const done = replayWindow(w.buffs, skills, buffNames);
		if (done) out[ruleKey(w)] = done;
	}
	return Object.keys(out).length ? out : undefined;
}
