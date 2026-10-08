// Support Combat Power. The game scores supports with its own battle point table (role 2, baked into
// support-data.ts): the score is Buff Power + Shield & Heal Power, each built like the dealer score,
//   Buff Power         = base attack / 1e4 × Π(1 + part / 1e4) over the "attack" parts
//   Shield & Heal Power = base health / 1e4 × Π(1 + part / 1e4) over the "defense" parts
// (lostark.bible's breakdown). The in-game score sits a few percent off this sum, so the simulator anchors
// edits on the real score, as it does for dealers.

import { PartType, partHigh } from './cp';
import { CORE_NAMES } from './game-data';
import { SUPPORT_BP, SUPPORT_BRACELET_EFFECTS } from './support-data';
import { CORE_BREAKPOINTS, type AccessoryLine } from './tables';
import type { BattlePointPart, Loadout } from './types';

export const isSupport = (l: Loadout) => l.battlePoint.isSupport;

/** Parts that count toward Shield & Heal Power; every other part (but base health) counts toward Buff Power. */
const DEFENSE_PARTS = new Set<number>([
	PartType.BaseHealth,
	PartType.EngravingDefense,
	PartType.AccessoryGrindingDefense,
	PartType.AccessoryCombatEffectDefense,
	PartType.BraceletEffectDefense,
	PartType.ArkGridCoreDefense,
	PartType.ArkGridGemDefense,
	PartType.ParadiseOrbDefense
]);

export function supportCombatPower(parts: BattlePointPart[]): { buff: number; shieldHeal: number; total: number } {
	const atk = parts.find((p) => p.type === PartType.BaseAttack);
	const hp = parts.find((p) => p.type === PartType.BaseHealth);
	let buff = (atk ? partHigh(atk) : 0) / 1e4;
	let shieldHeal = (hp ? partHigh(hp) : 0) / 1e4;
	for (const p of parts) {
		if (p === atk || p === hp) continue;
		const f = 1 + partHigh(p) / 1e4;
		if (DEFENSE_PARTS.has(p.type)) shieldHeal *= f;
		else buff *= f;
	}
	return { buff, shieldHeal, total: buff + shieldHeal };
}

// --- Gems: battle points by level (index 0 = Lv. 1).
export const SUPPORT_GEM_T4: number[] = SUPPORT_BP.gems.T4;
export const SUPPORT_GEM_T3: number[] = SUPPORT_BP.gems.T3;

// --- Engravings: [stone][relic book step], like the dealer table. Defense engravings score Shield & Heal Power.
export const supportEngravingTable = (id: number): { table: number[][]; defense: boolean } | undefined => {
	const atk = (SUPPORT_BP.engravings as Record<string, number[][]>)[id];
	if (atk) return { table: atk, defense: false };
	const def = (SUPPORT_BP.engravingsDefense as Record<string, number[][]>)[id];
	return def ? { table: def, defense: true } : undefined;
};
export const supportEngravingIds = () =>
	[...Object.keys(SUPPORT_BP.engravings), ...Object.keys(SUPPORT_BP.engravingsDefense)].map(Number);

// --- Accessories [game]: line values are the T4 low / mid / high rolls; coefficients from the support table.
const coeff = (rows: number[][], kind: number, index = 0) => (rows.find((r) => r[0] === kind && r[1] === index)?.[2] ?? 0) / 1e4;
const BRAND = coeff(SUPPORT_BP.accessory, 1, 46);
const ALLY_ATK = coeff(SUPPORT_BP.accessory, 2);
const ALLY_DMG = coeff(SUPPORT_BP.accessory, 3);
const HEAL = coeff(SUPPORT_BP.accessoryDefense, 2);
const SHIELD = coeff(SUPPORT_BP.accessoryDefense, 3);
/** Identity meter gain on necklaces: class option 6000 / 6001 / 6002 = low / mid / high, scored directly. */
const IDENTITY = Object.fromEntries(SUPPORT_BP.accessoryEffect.filter((r) => r[0] === 29).map((r) => [r[1], r[2]]));

export interface SupportAccessoryLine extends AccessoryLine {
	/** Scores Shield & Heal Power (part 16) instead of Buff Power. */
	defense?: boolean;
}

export const SUPPORT_ACCESSORY_LINES: SupportAccessoryLine[] = [
	{ key: 's_brand', name: 'Brand Power', match: (s) => s.type === 2 && s.index === 46, values: { low: 215, mid: 480, high: 800 }, toBattlePoints: (v) => v * BRAND, slots: ['neck'], primary: true },
	{ key: 's_identity', name: 'Identity Meter Gain', match: (s) => s.type === 29, values: { low: IDENTITY[6000], mid: IDENTITY[6001], high: IDENTITY[6002] }, toBattlePoints: (v) => v, slots: ['neck'], primary: true, combatEffect: true },
	{ key: 's_heal', name: 'Recovery for Party Members', match: (s) => s.type === 50, values: { low: 95, mid: 210, high: 350 }, toBattlePoints: (v) => v * HEAL, slots: ['ear'], primary: true, defense: true },
	{ key: 's_shield', name: 'Shield for Party Members', match: (s) => s.type === 51, values: { low: 95, mid: 210, high: 350 }, toBattlePoints: (v) => v * SHIELD, slots: ['ear'], primary: true, defense: true },
	{ key: 's_ally_atk', name: 'Ally Atk. Power Enhancement Effect', match: (s) => s.type === 54, values: { low: 135, mid: 300, high: 500 }, toBattlePoints: (v) => v * ALLY_ATK, slots: ['finger'], primary: true },
	{ key: 's_ally_dmg', name: 'Ally Damage Enhancement Effect', match: (s) => s.type === 59, values: { low: 200, mid: 450, high: 750 }, toBattlePoints: (v) => v * ALLY_DMG, slots: ['finger'], primary: true },
	// Weapon Power raises Attack Power, which Buff Power is built on.
	{ key: 'weapon_pct', name: 'Weapon Power %', match: (s) => s.type === 2 && s.index === 152, values: { low: 80, mid: 180, high: 300 }, weapon: 'percent', slots: ['ear'], primary: false },
	{ key: 'weapon_flat', name: 'Weapon Power', match: (s) => s.type === 2 && s.index === 151, values: { low: 195, mid: 480, high: 960 }, weapon: 'flat', slots: ['neck', 'ear', 'finger'], primary: false }
];

// --- Ark grid cores: battle points per breakpoint (10/14/17/18/19/20P) by exact core id.
const CORES = SUPPORT_BP.cores as Record<string, (number | null)[]>;
const CORES_DEF = SUPPORT_BP.coresDefense as Record<string, (number | null)[]>;

/** Support battle points of a core id at `points`, and whether it scores Shield & Heal Power. */
export function supportCoreValue(id: number, points: number): { value: number; defense: boolean } {
	const defense = !CORES[id] && !!CORES_DEF[id];
	const curve = (defense ? CORES_DEF : CORES)[id] ?? [];
	let idx = -1;
	CORE_BREAKPOINTS.forEach((bp, i) => {
		if (points >= bp) idx = i;
	});
	return { value: idx < 0 ? 0 : (curve[idx] ?? 0), defense };
}

const GRADE_DIGIT = { heroic: '3', legendary: '4', relic: '5', ancient: '6' } as const;
/** The id of the same core as another grade and (chaos) option variant: 673 A S V xx G. */
export function swappedCoreId(id: number, grade: keyof typeof GRADE_DIGIT, variant?: number): number {
	const s = String(id);
	const v = variant === undefined ? s[5] : String(variant);
	const candidate = `${s.slice(0, 5)}${v}${s.slice(6, 8)}${GRADE_DIGIT[grade]}`;
	if (CORES[candidate] || CORES_DEF[candidate]) return Number(candidate);
	// Chaos options other than the equipped one use "00" in the middle digits.
	const chaos = `${s.slice(0, 5)}${v}00${GRADE_DIGIT[grade]}`;
	return Number(CORES[chaos] || CORES_DEF[chaos] ? chaos : candidate);
}

export const coreOptionName = (id: number) => CORE_NAMES[String(id).slice(0, 8)];

// --- Astrogem options: battle points by total level (index 0 = Lv. 1).
const ASTRO = SUPPORT_BP.astrogem as Record<string, number[]>;
export const SUPPORT_ASTROGEM_OPTIONS = Object.keys(ASTRO).map(Number);
export const supportAstrogemValue = (id: number, level: number) => (level <= 0 ? 0 : (ASTRO[id]?.[Math.min(level, ASTRO[id].length) - 1] ?? 0));

// --- Bracelet: effects score Buff Power (part 20) or Shield & Heal Power (part 21); % stat lines score part 19.
export const supportBraceletEffect = (key: string) => SUPPORT_BRACELET_EFFECTS.find((e) => e.key === key);
/** Bracelet % stat lines by stat type: Ally Atk. Power Enhancement (54), Ally Damage Enhancement (59). */
export const SUPPORT_BRACELET_STAT_COEFF: Record<number, number> = Object.fromEntries(
	SUPPORT_BP.braceletStat.map(([kind, , c]) => [kind === 2 ? 54 : 59, c])
);
/** Combat stats that count for supports (by stat index), battle points per point. */
export const SUPPORT_COMBAT_STAT_BP: Record<number, number> = Object.fromEntries(
	Object.entries(SUPPORT_BP.combatStat).map(([kind, v]) => [14 + Number(kind), v])
);
export const SUPPORT_EVOLUTION_KARMA_PER_RANK: number = SUPPORT_BP.evolutionKarmaPerRank;
