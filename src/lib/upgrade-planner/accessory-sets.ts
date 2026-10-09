// Whole-accessory upgrades: an accessory's lines can't be changed one at a time (polishing rolls them at random), so the
// next step is buying another one, all three lines at once. Per slot this offers a short ladder of buys: the two
// main lines at High/Mid or High/High, and the third line (the slot's best secondary line) at none / Low / Mid / High.
// Each is scored by simulating the slot with exactly those three lines; options that don't beat the current
// accessory, or are no better than a lower roll, are dropped.

import { roleOf } from './roles';
import { ACCESSORY_SLOTS, familyOf, simulate, type AccessorySlot, type SimLine, type SimState } from './simulate';
import type { Tier } from './tables';
import type { Loadout } from './types';
import type { Upgrade } from './upgrades';

const SLOT_NAMES: Record<AccessorySlot, string> = { neck: 'Necklace', ear1: 'Earring 1', ear2: 'Earring 2', finger1: 'Ring 1', finger2: 'Ring 2' };
const RANK: Record<Tier | 'none', number> = { none: 0, low: 1, mid: 2, high: 3 };
const THIRD: (Tier | 'none')[] = ['none', 'low', 'mid', 'high'];

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

export function accessorySetUpgrades(l: Loadout, state: SimState, base: SimState): Upgrade[] {
	const role = roleOf(l);
	const cp = simulate(l, state, base).cp;
	if (!(cp > 0)) return [];
	const gainOf = (set: AccessorySet) => {
		const next = structuredClone(state);
		applyAccessorySet(next, set);
		return (simulate(l, next, base).cp / cp - 1) * 100;
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
		// High/Mid puts the High on the line that's worth more.
		const aHigh = gainOf({ slot, lines: [{ key: a.key, tier: 'high' }, { key: b.key, tier: 'mid' }] });
		const bHigh = gainOf({ slot, lines: [{ key: a.key, tier: 'mid' }, { key: b.key, tier: 'high' }] });
		const highMid = aHigh >= bHigh ? [a.key, b.key] : [b.key, a.key];
		const mainSets: { key: string; tier: Tier }[][] = [
			[{ key: highMid[0], tier: 'high' }, { key: highMid[1], tier: 'mid' }],
			[{ key: a.key, tier: 'high' }, { key: b.key, tier: 'high' }]
		];
		// The third line: the secondary line worth the most on top of High/High.
		const thirds = fits.filter((x) => !x.primary);
		const third = thirds
			.map((x) => ({ key: x.key, gain: gainOf({ slot, lines: [...mainSets[1], { key: x.key, tier: 'high' }] }) }))
			.sort((x, y) => y.gain - x.gain)[0]?.key;
		const options = mainSets.flatMap((mainLines, m) =>
			(third ? THIRD : (['none'] as const)).map((t) => {
				const set: AccessorySet = { slot, lines: t === 'none' ? mainLines : [...mainLines, { key: third!, tier: t }] };
				return { set, rank: [m, RANK[t]], gain: gainOf(set) };
			})
		);
		// Keep a buy only if it beats the current accessory and every lower roll of it.
		const kept = options.filter(
			(o) => o.gain > 0.0005 && !options.some((p) => p !== o && p.rank[0] <= o.rank[0] && p.rank[1] <= o.rank[1] && p.gain >= o.gain)
		);
		for (const o of kept) {
			const [m1, m2, t3] = o.set.lines;
			out.push({
				key: accessorySetKey(o.set),
				category: 'accessory',
				subject: SLOT_NAMES[slot],
				title: [m1, m2, t3].filter(Boolean).map((x) => nameOf(x.key)).join(' · ') + (t3 ? '' : ' · —'),
				lines: o.set.lines.map((x) => ({ name: nameOf(x.key), tier: x.tier })),
				detail: `Buy ${slot.startsWith('ear') ? 'an' : 'a'} ${SLOT_NAMES[slot].replace(/ \d$/, '').toLowerCase()} with ${o.set.lines.map((x) => `${nameOf(x.key)} ${x.tier}`).join(', ')}${t3 ? '' : ' and no useful third line'}. Price it as one market purchase.`,
				gainPct: o.gain,
				count: 1,
				approximate: o.set.lines.some((x) => !role.accessoryLines.find((y) => y.key === x.key)?.toBattlePoints),
				group: `accset:${slot}`
			});
		}
	}
	return out;
}
