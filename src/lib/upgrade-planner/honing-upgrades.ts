// Next Upgrades for equipment honing. Scored by running the simulator with the one change, so the number matches
// what the Equipment card shows. (Lives apart from upgrades.ts because simulate.ts imports that module.)

import { HONING_SLOTS, type HoningSlot } from './honing-data';
import { initSimState, simulate } from './simulate';
import type { Loadout } from './types';
import type { Upgrade } from './upgrades';

export const HONING_SLOT_LABELS: Record<HoningSlot, string> = {
	head: 'Head',
	shoulder: 'Shoulder',
	upper_body: 'Chest',
	lower_body: 'Pants',
	hand: 'Gloves',
	weapon: 'Weapon'
};
const MAX_HONING = 25;
const MAX_ADVANCED = 40;
/** Advanced honing is shown to the next tier (10 / 20 / 30 / 40); single levels are too small to rank. */
const ADVANCED_STEP = 10;

export function honingUpgrades(l: Loadout): Upgrade[] {
	const base = initSimState(l);
	const cp0 = simulate(l, base, base).cp;
	if (!(cp0 > 0)) return [];
	const gainWith = (slot: HoningSlot, edit: { honing?: number; advanced?: number }) => {
		const s = structuredClone(base);
		s.gear[slot] = { ...s.gear[slot]!, ...edit };
		return (simulate(l, s, base).cp / cp0 - 1) * 100;
	};
	const out: Upgrade[] = [];
	for (const slot of HONING_SLOTS) {
		const g = base.gear[slot];
		if (!g) continue;
		const subject = HONING_SLOT_LABELS[slot];
		const group = slot === 'weapon' ? 'honing:weapon' : 'honing:armor';
		if (g.honing < MAX_HONING)
			out.push({
				key: `honing:${slot}:${g.honing + 1}`,
				category: 'honing',
				subject,
				title: `Honing +${g.honing} → +${g.honing + 1}`,
				detail: slot === 'weapon' ? 'Raises Weapon Power.' : 'Raises main stat.',
				gainPct: gainWith(slot, { honing: g.honing + 1 }),
				count: 1,
				approximate: true,
				group
			});
		if (g.advanced < MAX_ADVANCED) {
			const to = Math.min(MAX_ADVANCED, (Math.floor(g.advanced / ADVANCED_STEP) + 1) * ADVANCED_STEP);
			out.push({
				key: `advanced:${slot}:${to}`,
				category: 'honing',
				subject,
				title: `Advanced honing ${g.advanced} → ${to}`,
				detail: `${to - g.advanced} advanced honing level${to - g.advanced > 1 ? 's' : ''}.`,
				gainPct: gainWith(slot, { advanced: to }),
				count: 1,
				approximate: true,
				group: `${group}:advanced`
			});
		}
	}
	return out;
}
