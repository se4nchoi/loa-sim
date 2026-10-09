// Whole-accessory upgrades: an accessory's lines can't be changed one at a time (polishing rolls them at random), so the
// next step is buying another one, all three lines at once. Per slot the candidates are the main-line rolls the player
// picked (High-High, High-Mid and its reverse, High-Low, Low-High, Mid-Mid), each with the third line (the slot's best
// secondary line) at none / Low / Mid / High. Each is scored by simulating the slot with exactly those three lines; the
// current accessory is the bottom line, so options that don't beat it, or are no better than a cheaper roll, are
// dropped and what's left is the ladder.

import { roleOf } from './roles';
import { ACCESSORY_SLOTS, familyOf, simulate, type AccessorySlot, type SimLine, type SimState } from './simulate';
import type { Tier } from './tables';
import type { Loadout } from './types';
import type { Upgrade } from './upgrades';

const SLOT_NAMES: Record<AccessorySlot, string> = { neck: 'Necklace', ear1: 'Earring 1', ear2: 'Earring 2', finger1: 'Ring 1', finger2: 'Ring 2' };
const RANK: Record<Tier | 'none', number> = { none: 0, low: 1, mid: 2, high: 3 };
const THIRD: (Tier | 'none')[] = ['none', 'low', 'mid', 'high'];

/** Main-line rolls, BiS line first: hm also offers its reverse Mid-High. */
export type AccRoll = 'hh' | 'hm' | 'hl' | 'lh' | 'mm';
export const ACC_ROLLS: { roll: AccRoll; label: string; also?: string }[] = [
	{ roll: 'hh', label: 'H-H' },
	{ roll: 'hm', label: 'H-M', also: 'M-H' },
	{ roll: 'hl', label: 'H-L' },
	{ roll: 'lh', label: 'L-H' },
	{ roll: 'mm', label: 'M-M' }
];
export const DEFAULT_ACC_ROLLS: AccRoll[] = ['hh', 'hm', 'hl', 'mm'];
const PAIRS: Record<AccRoll, [Tier, Tier][]> = {
	hh: [['high', 'high']],
	hm: [['high', 'mid'], ['mid', 'high']],
	hl: [['high', 'low']],
	lh: [['low', 'high']],
	mm: [['mid', 'mid']]
};

export interface AccessorySet {
	slot: AccessorySlot;
	lines: { key: string; tier: Tier }[];
}

/** "accset:<slot>:<key>.<tier>,<key>.<tier>[,<key>.<tier>]" ↔ the target lines. */
export const accessorySetKey = (set: AccessorySet) => `accset:${set.slot}:${set.lines.map((l) => `${l.key}.${l.tier}`).join(',')}`;
export function parseAccessorySetKey(key: string): AccessorySet | null {
	const [kind, slot, lines] = key.split(':');
	if (kind !== 'accset' || !ACCESSORY_SLOTS.includes(slot as AccessorySlot) || !lines) return null;
	return { slot: slot as AccessorySlot, lines: lines.split(',').map((p) => ({ key: p.slice(0, p.lastIndexOf('.')), tier: p.slice(p.lastIndexOf('.') + 1) as Tier })) };
}

/** The slot's lines replaced by exactly the set's lines (missing ones become a non-scoring "other" line). */
export function applyAccessorySet(state: SimState, set: AccessorySet): boolean {
	if (!state.accessories[set.slot]) return false;
	const lines: SimLine[] = set.lines.map((l) => ({ key: l.key, tier: l.tier }));
	while (lines.length < 3) lines.push({ key: 'other', label: 'Other' });
	state.accessories[set.slot] = lines;
	return true;
}

export function accessorySetUpgrades(l: Loadout, state: SimState, base: SimState, rolls: AccRoll[] = DEFAULT_ACC_ROLLS): Upgrade[] {
	const pairs = rolls.flatMap((r) => PAIRS[r] ?? []);
	if (!pairs.length) return [];
	const role = roleOf(l);
	const cp = simulate(l, state, base).cp;
	if (!(cp > 0)) return [];
	// simulate() only reads the state, so each candidate shares it and swaps in the one slot's lines (no deep copy);
	// results are remembered, since the ladder's options overlap.
	const memo = new Map<string, number>();
	const gainOf = (set: AccessorySet) => {
		const key = accessorySetKey(set);
		let gain = memo.get(key);
		if (gain === undefined) {
			const lines: SimLine[] = set.lines.map((x) => ({ key: x.key, tier: x.tier }));
			while (lines.length < 3) lines.push({ key: 'other', label: 'Other' });
			gain = (simulate(l, { ...state, accessories: { ...state.accessories, [set.slot]: lines } }, base).cp / cp - 1) * 100;
			memo.set(key, gain);
		}
		return gain;
	};
	const nameOf = (key: string) => role.accessoryLines.find((x) => x.key === key)?.name ?? key;
	const out: Upgrade[] = [];
	for (const slot of ACCESSORY_SLOTS) {
		if (!state.accessories[slot]) continue;
		const family = familyOf(slot);
		const fits = role.accessoryLines.filter((x) => x.slots.includes(family));
		const mains = fits.filter((x) => x.primary);
		if (mains.length < 2) continue;
		const [a, b] = mains;

		const highHigh = [{ key: a.key, tier: 'high' as Tier }, { key: b.key, tier: 'high' as Tier }];
		// The third line: the secondary line worth the most on top of High/High.
		const thirds = fits.filter((x) => !x.primary);
		const best = thirds
			.map((x) => ({ key: x.key, gain: gainOf({ slot, lines: [...highHigh, { key: x.key, tier: 'high' }] }) }))
			.sort((x, y) => y.gain - x.gain)[0];
		const third = best?.key;
		// The top roll (High/High + best third at High) bounds every other option: if it doesn't beat the current
		// accessory, nothing on this slot does.
		if (Math.max(best?.gain ?? -Infinity, gainOf({ slot, lines: highHigh })) <= 0.0005) continue;
		// High/Mid puts the High on the line that's worth more.
		const aHigh = gainOf({ slot, lines: [{ key: a.key, tier: 'high' }, { key: b.key, tier: 'mid' }] });
		const bHigh = gainOf({ slot, lines: [{ key: a.key, tier: 'mid' }, { key: b.key, tier: 'high' }] });
		const highMid = aHigh >= bHigh ? [a.key, b.key] : [b.key, a.key];
		const order = (key: string) => (key === highMid[0] ? 0 : key === highMid[1] ? 1 : 2);
		// The picked main rolls (x on the BiS-High line, y on the other), times every third roll.
		const options = pairs.flatMap(([x, y]) =>
			(third ? THIRD : (['none'] as const)).map((t) => {
				const mainLines = [{ key: highMid[0], tier: x }, { key: highMid[1], tier: y }];
				const set: AccessorySet = { slot, lines: t === 'none' ? mainLines : [...mainLines, { key: third!, tier: t }] };
				return { set, x: RANK[x], y: RANK[y], t: RANK[t], gain: gainOf(set) };
			})
		);
		// p is no pricier than o: its rolls are each at or below o's (High-Low under High-Mid, Mid-Mid under High-Mid),
		// and Mid-High, the reverse, counts as cheaper than High-Mid.
		type Option = (typeof options)[number];
		const noPricier = (p: Option, o: Option) => {
			const [ph, pl, oh, ol] = [Math.max(p.x, p.y), Math.min(p.x, p.y), Math.max(o.x, o.y), Math.min(o.x, o.y)];
			if (p.t > o.t || ph > oh || pl > ol) return false;
			if (ph !== oh || pl !== ol) return true;
			return p.x === o.x || (ph === RANK.high && pl === RANK.mid && p.x < o.x);
		};
		// The current accessory is the bottom line: keep a buy only if it beats it and every cheaper roll.
		const kept = options.filter((o) => o.gain > 0.0005 && !options.some((p) => p !== o && noPricier(p, o) && p.gain >= o.gain));
		for (const o of kept) {
			const [m1, m2, t3] = o.set.lines;
			out.push({
				key: accessorySetKey(o.set),
				category: 'accessory',
				subject: SLOT_NAMES[slot],
				title: [m1, m2, t3].filter(Boolean).map((x) => nameOf(x.key)).join(' · ') + (t3 ? '' : ' · None'),
				// Main lines best-in-slot first: High-Mid is the BiS roll, Mid-High its reverse.
				lines: [...o.set.lines].sort((x, y) => order(x.key) - order(y.key)).map((x) => ({ name: nameOf(x.key), tier: x.tier })),
				detail: '',
				gainPct: o.gain,
				count: 1,
				approximate: o.set.lines.some((x) => !role.accessoryLines.find((y) => y.key === x.key)?.toBattlePoints),
				group: `accset:${slot}`
			});
		}
	}
	return out;
}
