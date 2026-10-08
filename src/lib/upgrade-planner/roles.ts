// Dealer vs support: which battle point table a loadout is scored with. Everything that differs between the
// two (gem / engraving / core / astrogem / accessory / bracelet values, which parts count, how the score adds
// up) is looked up here, so the simulator and the upgrade list share one code path.

import { BRACELET_EFFECTS } from './game-data';
import { PartType, combatPower } from './cp';
import {
	SUPPORT_ACCESSORY_LINES,
	SUPPORT_ASTROGEM_OPTIONS,
	SUPPORT_BRACELET_STAT_COEFF,
	SUPPORT_COMBAT_STAT_BP,
	SUPPORT_EVOLUTION_KARMA_PER_RANK,
	SUPPORT_GEM_T3,
	SUPPORT_GEM_T4,
	supportAstrogemValue,
	supportBraceletEffect,
	supportCombatPower,
	supportEngravingIds,
	supportEngravingTable,
	type SupportAccessoryLine
} from './support';
import {
	ACCESSORY_LINES,
	ASTROGEM_COEFF,
	GEM_T3,
	GEM_T4,
	KARMA_EVOLUTION_PER_RANK,
	KARMA_LEAP_PER_LEVEL,
	astrogemOptionValue,
	engravingIds,
	engravingTable
} from './tables';
import type { BattlePointPart, Loadout } from './types';

export interface RoleTables {
	support: boolean;
	gemT4: number[];
	gemT3: number[];
	/** [stone][relic book step] battle points; `defense` engravings score Shield & Heal Power (part 11). */
	engraving: (id: number) => { table: number[][]; defense: boolean } | undefined;
	engravingIds: () => number[];
	accessoryLines: SupportAccessoryLine[];
	/** Astrogem options that score for this role, and their battle points by total level. */
	astrogemOptions: number[];
	astrogemValue: (id: number, level: number) => number;
	/** Bracelet effect battle points; `defense` effects score part 21. */
	braceletEffect: (key: string) => { value: number; defense: boolean } | undefined;
	/** Bracelet % stat lines, by "statType:index" → coefficient per 1e4. */
	braceletStatCoeff: Record<string, number>;
	/** Combat stats that count, by stat index → battle points per point. */
	combatStatBp: Record<number, number>;
	evolutionKarmaPerRank: number;
	/** 0 when Leap karma doesn't score for this role. */
	leapKarmaPerLevel: number;
	/** Score from battle point parts (before anchoring on the in-game score). */
	score: (parts: BattlePointPart[]) => number;
}

const DEALER: RoleTables = {
	support: false,
	gemT4: GEM_T4,
	gemT3: GEM_T3,
	engraving: (id) => {
		const table = engravingTable(id);
		return table ? { table, defense: false } : undefined;
	},
	engravingIds,
	accessoryLines: ACCESSORY_LINES,
	astrogemOptions: Object.keys(ASTROGEM_COEFF).map(Number),
	astrogemValue: astrogemOptionValue,
	braceletEffect: (key) => {
		const e = BRACELET_EFFECTS.find((x) => x.key === key);
		return e ? { value: e.value, defense: false } : undefined;
	},
	braceletStatCoeff: { '2:50': 7692, '2:74': 7000, '2:76': 3333 },
	combatStatBp: { 15: 3, 16: 3, 18: 3 },
	evolutionKarmaPerRank: KARMA_EVOLUTION_PER_RANK,
	leapKarmaPerLevel: KARMA_LEAP_PER_LEVEL,
	score: (parts) => combatPower(parts).max
};

const SUPPORT: RoleTables = {
	support: true,
	gemT4: SUPPORT_GEM_T4,
	gemT3: SUPPORT_GEM_T3,
	engraving: supportEngravingTable,
	engravingIds: supportEngravingIds,
	accessoryLines: SUPPORT_ACCESSORY_LINES,
	astrogemOptions: SUPPORT_ASTROGEM_OPTIONS,
	astrogemValue: supportAstrogemValue,
	braceletEffect: (key) => {
		const e = supportBraceletEffect(key);
		return e ? { value: e.value, defense: e.side === 'defense' } : undefined;
	},
	braceletStatCoeff: Object.fromEntries(Object.entries(SUPPORT_BRACELET_STAT_COEFF).map(([t, c]) => [`${t}:0`, c])),
	combatStatBp: SUPPORT_COMBAT_STAT_BP,
	evolutionKarmaPerRank: SUPPORT_EVOLUTION_KARMA_PER_RANK,
	leapKarmaPerLevel: 0,
	score: (parts) => supportCombatPower(parts).total
};

export const roleOf = (l: Loadout): RoleTables => (l.battlePoint.isSupport ? SUPPORT : DEALER);

/** Engraving parts this role scores (supports also have Shield & Heal engravings). */
export const engravingPartTypes = (r: RoleTables) =>
	r.support ? [PartType.Engraving, PartType.EngravingDefense] : [PartType.Engraving];
