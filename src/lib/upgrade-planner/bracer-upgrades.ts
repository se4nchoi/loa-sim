import { nextBracer } from './bracer';
import { initSimState, itemLevel, simulate, type SimState } from './simulate';
import type { Loadout } from './types';
import type { Upgrade } from './upgrades';

/** Score against the live simulation so successive Apply clicks always show the next legal step. */
export function bracerUpgrades(l: Loadout, state = initSimState(l), base: SimState = initSimState(l)): Upgrade[] {
	if ((itemLevel(state) || l.itemLevel) < 1750) return [];
	const to = nextBracer(state.bracer);
	if (!to) return [];
	const before = simulate(l, state, base).cp;
	if (!(before > 0)) return [];
	const after = simulate(l, { ...state, bracer: to }, base).cp;
	const from = state.bracer;
	const name = (grade: string) => grade[0].toUpperCase() + grade.slice(1);
	return [{
		key: `bracer:${to.grade}:${to.honing}`,
		category: 'honing',
		subject: 'Bracer',
		title: !from ? 'Equip Epic +0' : from.grade !== to.grade
			? `${name(from.grade)} → ${name(to.grade)} (+${to.honing})`
			: `Honing +${from.honing} → +${to.honing}`,
		detail: !from ? 'KR preview · First Belgardin clear.' : from.grade !== to.grade
			? 'KR preview · Limit break: +1% basic Atk. Power.'
			: 'KR preview · One bracer honing level.',
		gainPct: (after / before - 1) * 100,
		count: 1,
		approximate: true,
		// The first bracer drops from the first Belgardin clear: free, so it tops the gold ranking.
		...(!from ? { knownCost: 0 } : {}),
		group: 'honing:bracer'
	}];
}
