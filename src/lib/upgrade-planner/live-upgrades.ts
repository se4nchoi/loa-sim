// Suggestions are generated from the edited state and priced by the same simulation as Apply.
import { accessorySetUpgrades, type AccRoll } from './accessory-sets';
import { applyUpgrade } from './apply-upgrade';
import { bracerUpgrades } from './bracer-upgrades';
import { honingUpgrades } from './honing-upgrades';
import { roleOf } from './roles';
import { gemParts, simCoreInfo, simCorePoints, simulate, type SimState } from './simulate';
import { ASTROGEM_OPTION_NAMES, CORE_BREAKPOINTS, CORE_GRADE_CAP, ENGRAVING_BOOK_STEPS, KARMA_MAX_LEVEL, karmaRank } from './tables';
import type { Loadout } from './types';
import { coreLabel, coreStates, engravingName, type Upgrade } from './upgrades';

const RANK_START = [0, 1, 5, 9, 13, 17, 21];

/** accRolls: which main-line rolls the accessory ladder offers (default: see DEFAULT_ACC_ROLLS). */
export function liveUpgrades(l: Loadout, state: SimState, base: SimState, accRolls?: AccRoll[]): Upgrade[] {
	const cp = simulate(l, state, base).cp;
	if (!(cp > 0)) return [];
	const role = roleOf(l);
	const candidates: Upgrade[] = [];
	const add = (u: Omit<Upgrade, 'gainPct' | 'count' | 'approximate'> & Partial<Pick<Upgrade, 'count' | 'approximate'>>) =>
		candidates.push({ count: 1, approximate: false, gainPct: 0, ...u });

	const gemInfo = gemParts(l);
	const gemGroups = new Map<string, number>();
	state.gems.forEach((gem, i) => {
		const info = gemInfo[i];
		if (!info?.table || gem.level >= 10) return;
		const key = `gem:${info.tier}:${gem.level}`;
		gemGroups.set(key, (gemGroups.get(key) ?? 0) + 1);
	});
	for (const [key, count] of gemGroups) {
		const [, tier, lv] = key.split(':');
		add({ key, category: 'gem', title: `${tier} gem Lv. ${lv} → ${Number(lv) + 1}`, detail: `${count} gems`, count });
	}

	for (const core of coreStates(l)) {
		const current = state.arkGrid.find((c) => c.id === core.id);
		if (!current) continue;
		const info = simCoreInfo(core.info, current);
		if (!role.support && info.supportOnly) continue;
		const points = simCorePoints(l, state, base, core.id);
		const next = CORE_BREAKPOINTS.find((p) => p > points && p <= CORE_GRADE_CAP[info.grade]);
		if (!next) continue;
		add({ key: `core:${core.id}:${next}`, category: 'core', title: `${coreLabel(info)} core → ${next}P`, detail: '', approximate: info.weaponCore || core.modelValue !== core.value });
	}
	for (const id of role.astrogemOptions) {
		const opts = state.arkGrid.flatMap((c) => c.gems.flatMap((g) => g.removed ? [] : g.opts.filter((o) => o.id === id)));
		if (!opts.some((o) => o.level < 5)) continue;
		const level = opts.reduce((n, o) => n + o.level, 0);
		add({ key: `astrogem:${id}`, category: 'astrogem', subject: 'Astrogems', title: `${ASTROGEM_OPTION_NAMES[id]} Lv. ${level} → ${level + 1}`, detail: '' });
	}
	for (const [id, e] of Object.entries(state.engravings)) {
		if (e.books >= ENGRAVING_BOOK_STEPS.length - 1) continue;
		const read = e.as ?? Number(id); // the engraving whose books are read (a swapped engraving reads its own)
		add({
			key: `engraving:${id}:books:${ENGRAVING_BOOK_STEPS[e.books + 1]}`,
			category: 'engraving',
			title: `${engravingName(read)} relic books ${ENGRAVING_BOOK_STEPS[e.books]} → ${ENGRAVING_BOOK_STEPS[e.books + 1]}`,
			detail: '',
			books: { engraving: read, name: engravingName(read), count: ENGRAVING_BOOK_STEPS[e.books + 1] - ENGRAVING_BOOK_STEPS[e.books] }
		});
	}
	// Accessories are bought whole (lines can't be changed one at a time): see accessory-sets.ts.
	const evolution = state.karma.evolution;
	if (role.support && evolution !== null && evolution < KARMA_MAX_LEVEL)
		add({ key: `karma:evolution-level:${evolution + 1}`, category: 'karma', group: 'karma:evolution', title: `Evolution karma level ${evolution} → ${evolution + 1}`, detail: '' });
	if (evolution !== null && karmaRank(evolution) < 6) {
		const rank = karmaRank(evolution);
		const to = RANK_START[rank + 1];
		if (!role.support || to > evolution + 1)
			add({ key: `karma:evolution:${rank + 1}`, category: 'karma', group: 'karma:evolution', subject: `Evolution Lv. ${evolution} → ${to}`, title: `Karma rank ${rank} → ${rank + 1}`, detail: '' });
	}
	for (const tree of ['enlightenment', 'leap'] as const) {
		const level = state.karma[tree];
		if (level === null || level >= KARMA_MAX_LEVEL || (tree === 'leap' && !role.leapKarmaPerLevel)) continue;
		add({ key: `karma:${tree}:${level + 1}`, category: 'karma', title: `${tree === 'leap' ? 'Leap' : 'Enlightenment'} karma level ${level} → ${level + 1}`, detail: '' });
	}

	const scored = candidates.flatMap((u) => {
		const next = structuredClone(state);
		if (!applyUpgrade(l, next, base, u)) return [];
		return [{ ...u, gainPct: (simulate(l, next, base).cp / cp - 1) * 100 }];
	});
	return [...scored, ...accessorySetUpgrades(l, state, base, accRolls), ...honingUpgrades(l, state, base), ...bracerUpgrades(l, state, base)]
		.filter((u) => u.gainPct > 0.0005)
		.sort((a, b) => b.gainPct - a.gainPct);
}
