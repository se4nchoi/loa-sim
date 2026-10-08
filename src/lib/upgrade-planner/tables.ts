// Battle-point tables used to price "next step" upgrades. Units are battle points:
// 1e4 = +100% combat power, so 704 means +7.04%.
//
// Sources
//  [inven]  "딜러 전투력 로직 분석 (25년 7월 9일 패치 반영)", inven.co.kr/board/lostark/4821/106546
//  [agl]    airplaner/lostark-arkgrid-gem-locator-v2 (MIT, © 2026 Airplaner), src/lib/models/arkGridCores.ts
//           and docs/algorithm.md
//  [game]   option values per grade as shown in-game (also lo4.app fixtures/accessory-options.csv)
// Every table below was checked against a live NA character on lostark.bible (see tables.test.ts).

/** [inven] Skill gems by level (index 0 = Lv1). */
export const GEM_T4 = [128, 192, 256, 320, 384, 448, 512, 576, 640, 704];
export const GEM_T3 = [48, 96, 144, 192, 240, 288, 336, 384, 480, 640];

// ---------------------------------------------------------------------------------------------
// Ark grid

/** Point breakpoints at which a core's effect steps up. */
export const CORE_BREAKPOINTS = [10, 14, 17, 18, 19, 20] as const;

export type CoreAttr = 'order' | 'chaos';
export type CoreShape = 'sun' | 'moon' | 'star';
export type CoreGrade = 'heroic' | 'legendary' | 'relic' | 'ancient';

export interface CoreInfo {
	attr: CoreAttr;
	shape: CoreShape;
	grade: CoreGrade;
	/** Chaos cores only: 0 = top-tier option (Flashy Attack, Smoldering Strike, Attack), 1 = second tier. */
	tier: number;
	/** Chaos star "Weapon": value depends on weapon power, so it's computed instead of tabled. */
	weaponCore: boolean;
	/** Support-only cores give dealers nothing. */
	supportOnly: boolean;
}

const GRADE_BY_DIGIT: Record<string, CoreGrade> = { '3': 'heroic', '4': 'legendary', '5': 'relic', '6': 'ancient' };
const SHAPES: CoreShape[] = ['sun', 'moon', 'star'];

/**
 * Decodes an ark grid core item id. Layout (from bible's item table): 673 A S V .. G
 *   A: 0 order / 1 chaos   S: 0 sun / 1 moon / 2 star   V (chaos only): option variant   G: grade 3–6
 * Chaos variants: sun 0 Flashy Attack, 1 Stable, 2 Swift, 3–5 support; moon 0 Smoldering Strike,
 * 1 Absorbing, 2 Crushing, 3–5 support; star 0 Attack, 1 Weapon, 2–5 support/defense.
 */
export function decodeCore(id: number): CoreInfo | null {
	const s = String(id);
	if (s.length !== 9 || !s.startsWith('673')) return null;
	const attr: CoreAttr = s[3] === '1' ? 'chaos' : 'order';
	const shape = SHAPES[Number(s[4])];
	const grade = GRADE_BY_DIGIT[s[8]];
	if (!shape || !grade) return null;
	const variant = Number(s[5]);
	if (attr === 'order') return { attr, shape, grade, tier: 0, weaponCore: false, supportOnly: false };
	if (shape === 'star')
		return { attr, shape, grade, tier: variant === 0 ? 0 : 1, weaponCore: variant === 1, supportOnly: variant >= 2 };
	return { attr, shape, grade, tier: variant === 0 ? 0 : 1, weaponCore: false, supportOnly: variant >= 3 };
}

/** Core battle points at 10/14/17/18/19/20P for dealers [agl]. */
function dealerCoreCurve(info: CoreInfo, weaponPower: number): number[] {
	if (info.supportOnly) return [0, 0, 0, 0, 0, 0];
	if (info.attr === 'order')
		return info.shape === 'star' ? [100, 250, 450, 467, 483, 500] : [150, 400, 750, 767, 783, 800];
	if (info.weaponCore) {
		// [agl] getWeaponCoeff: weapon power gained, as a √ multiplier on base attack.
		const ancient = info.grade === 'ancient';
		const flat17 = ancient ? 5200 : 3900;
		const pct17 = ancient ? 3 : 2.25;
		const steps: [number, number][] = [
			[1300, 0], [1300, 0.75], [flat17, pct17], [flat17, pct17 + 0.23], [flat17, pct17 + 0.46], [flat17, pct17 + 0.69]
		];
		// bible exposes total weapon power only; assume ~9% of it comes from % bonuses like [agl]'s default.
		const pct = 9;
		const fixed = weaponPower / (1 + pct / 100);
		return steps.map(([f, p]) => Math.floor((Math.sqrt(((fixed + f) * (1 + (pct + p) / 100)) / weaponPower) - 1) * 1e4));
	}
	if (info.tier === 0) return [50, 100, 250, 267, 283, 300];
	return [0, 50, 150, 167, 183, 200];
}

/** Highest breakpoint each grade can activate. */
export const CORE_GRADE_CAP: Record<CoreGrade, number> = { heroic: 10, legendary: 14, relic: 20, ancient: 20 };

/** Willpower a core supplies by grade [agl getDefaultCoreEnergy]; its astrogems' willpower must fit in it. */
export const CORE_WILLPOWER: Record<CoreGrade, number> = { heroic: 9, legendary: 12, relic: 15, ancient: 17 };

/** Dealer battle points for a core at `points`. */
export function coreValue(info: CoreInfo, points: number, weaponPower: number): number {
	const curve = dealerCoreCurve(info, weaponPower);
	const capped = Math.min(points, CORE_GRADE_CAP[info.grade]);
	let idx = -1;
	CORE_BREAKPOINTS.forEach((bp, i) => {
		if (capped >= bp) idx = i;
	});
	if (idx < 0) return 0;
	// Ancient cores add +100 from 17P on, except the chaos "Weapon" star [agl adjustCoeff].
	const ancientBonus = info.grade === 'ancient' && idx >= 2 && !info.weaponCore && !info.supportOnly ? 100 : 0;
	return curve[idx] + ancientBonus;
}

/** Astrogem option ids as they appear in bible's `arkGridCores[].gems[].opts[].id` and part 31 ids. */
export const AstrogemOption = { Attack: 2001, AdditionalDamage: 2002, BossDamage: 2003 } as const;

/** [agl] battle points = floor(totalLevel × coeff / 120). Support options (2011–2013) are 0 for dealers. */
export const ASTROGEM_COEFF: Record<number, number> = {
	[AstrogemOption.Attack]: 400,
	[AstrogemOption.AdditionalDamage]: 700,
	[AstrogemOption.BossDamage]: 1000
};

export const astrogemOptionValue = (optionId: number, totalLevel: number) =>
	Math.floor((totalLevel * (ASTROGEM_COEFF[optionId] ?? 0)) / 120);

/** Compact labels for tight UI. */
export const ASTROGEM_OPTION_SHORT: Record<number, string> = {
	2001: 'Atk. Power',
	2002: 'Add. Dmg',
	2003: 'Boss Dmg',
	2011: 'Ally Dmg',
	2012: 'Brand',
	2013: 'Ally Atk.'
};

export const ASTROGEM_OPTION_NAMES: Record<number, string> = {
	2001: 'Atk. Power',
	2002: 'Additional Damage',
	2003: 'Boss Damage',
	2011: 'Ally Damage Enh.',
	2012: 'Brand Power',
	2013: 'Ally Atk. Enh.'
};

// ---------------------------------------------------------------------------------------------
// Engravings: [inven] battle points by ability stone level (rows 0–4) × relic books read
// (columns 0/5/10/15/20). Keyed by bible's engraving id (game id + 1000).

export const ENGRAVING_BOOK_STEPS = [0, 5, 10, 15, 20];

const row = (...v: number[]) => v.map((x) => Math.round(x * 100));
const ENGRAVING_TABLE: Record<number, number[][]> = {
	1118: [row(18, 18.75, 19.5, 20.25, 21), row(21, 21.75, 22.5, 23.25, 24), row(21.75, 22.5, 23.25, 24, 24.75), row(23.25, 24, 24.75, 25.5, 26.25), row(24, 24.75, 25.5, 26.25, 27)], // Grudge 원한
	1299: [row(15.2, 16.25, 17.3, 18.35, 19.4), row(18.08, 19.13, 20.18, 21.23, 22.28), row(18.8, 19.85, 20.9, 21.95, 23), row(20.18, 21.23, 22.28, 23.33, 24.38), row(20.9, 21.95, 23, 24.05, 25.1)], // Adrenaline 아드레날린
	1254: [row(16, 16.8, 17.6, 18.4, 19.2), row(19, 19.8, 20.6, 21.4, 22.2), row(19.76, 20.56, 21.36, 22.16, 22.96), row(21.28, 22.08, 22.88, 23.68, 24.48), row(22, 22.8, 23.6, 24.4, 25.2)], // Raid Captain 돌격대장
	1295: [row(16, 16.75, 17.5, 18.25, 19), row(19, 19.75, 20.5, 21.25, 22), row(19.75, 20.5, 21.25, 22, 22.75), row(21.25, 22, 22.75, 23.5, 24.25), row(22, 22.75, 23.5, 24.25, 25)], // Mass Increase 질량 증가
	1288: [row(15.3, 16, 16.7, 17.4, 18.1), row(18, 18.7, 19.4, 20.1, 20.8), row(18.7, 19.4, 20.1, 20.8, 21.5), row(20, 20.7, 21.4, 22.1, 22.8), row(20.7, 21.4, 22.1, 22.8, 23.5)], // Master Brawler 결투의 대가
	1249: [row(15.3, 16, 16.7, 17.4, 18.1), row(18, 18.7, 19.4, 20.1, 20.8), row(18.7, 19.4, 20.1, 20.8, 21.5), row(20, 20.7, 21.4, 22.1, 22.8), row(20.7, 21.4, 22.1, 22.8, 23.5)], // Ambush Master 기습의 대가
	1141: [row(14.39, 15.13, 15.88, 16.62, 17.36), row(17.18, 17.92, 18.67, 19.41, 20.15), row(17.89, 18.63, 19.38, 20.12, 20.86), row(19.31, 20.05, 20.8, 21.54, 22.28), row(19.98, 20.72, 21.47, 22.21, 22.95)], // Keen Blunt Weapon 예리한 둔기
	1300: [row(14.4, 15, 15.6, 16.2, 16.8), row(16.8, 17.4, 18, 18.6, 19.2), row(17.4, 18, 18.6, 19.2, 19.8), row(18.6, 19.2, 19.8, 20.4, 21), row(19.2, 19.8, 20.4, 21, 21.6)], // All-Out Attack 속전속결
	1121: [row(14.4, 15, 15.6, 16.2, 16.8), row(16.8, 17.4, 18, 18.6, 19.2), row(17.4, 18, 18.6, 19.2, 19.8), row(18.6, 19.2, 19.8, 20.4, 21), row(19.2, 19.8, 20.4, 21, 21.6)], // Super Charge 슈퍼 차지
	1110: [row(12.6, 13.5, 14.4, 15.3, 16.2), row(15.6, 16.5, 17.4, 18.3, 19.2), row(16.5, 17.4, 18.3, 19.2, 20.1), row(18, 18.9, 19.8, 20.7, 21.6), row(18.6, 19.5, 20.4, 21.3, 22.2)], // Ether Predator 에테르 포식자 (30 stacks)
	1168: [row(13, 13.75, 14.5, 15.25, 16), row(16, 16.75, 17.5, 18.25, 19), row(16.75, 17.5, 18.25, 19, 19.75), row(18.25, 19, 19.75, 20.5, 21.25), row(19, 19.75, 20.5, 21.25, 22)], // MP Efficiency Increase 마나 효율 증가
	1107: [row(9.9, 10.73, 11.55, 12.38, 13.2), row(12.3, 13.13, 13.95, 14.78, 15.6), row(12.9, 13.73, 14.55, 15.38, 16.2), row(14.1, 14.93, 15.75, 16.58, 17.4), row(14.7, 15.53, 16.35, 17.18, 18)], // Disrespect 약자 무시
	1303: [row(10.6, 11.13, 11.65, 12.18, 12.7), row(12.7, 13.23, 13.75, 14.28, 14.8), row(13.23, 13.76, 14.28, 14.81, 15.33), row(14.28, 14.81, 15.33, 15.86, 16.38), row(14.8, 15.33, 15.85, 16.38, 16.9)], // Precise Dagger 정밀 단도
	1296: [row(9.8, 10.33, 10.85, 11.38, 11.9), row(11.9, 12.43, 12.95, 13.48, 14), row(12.43, 12.96, 13.48, 14.01, 14.53), row(13.48, 14.01, 14.53, 15.06, 15.58), row(14, 14.53, 15.05, 15.58, 16.1)], // Propulsion 추진력
	1251: [row(7.53, 8.4, 9.29, 10.2, 11.11), row(7.53, 8.4, 9.29, 10.2, 11.11), row(7.53, 8.4, 9.29, 10.2, 11.11), row(7.53, 8.4, 9.29, 10.2, 11.11), row(7.53, 8.4, 9.29, 10.2, 11.11)], // Magick Stream 마나의 흐름 (stone has no effect)
	1298: [row(7.5, 7.88, 8.25, 8.63, 9), row(8.7, 9.08, 9.45, 9.83, 10.2), row(9, 9.38, 9.75, 10.13, 10.5), row(9.6, 9.98, 10.35, 10.73, 11.1), row(9.9, 10.28, 10.65, 11.03, 11.4)], // Sight Focus 시선 집중
	1245: [row(7.4, 7.65, 7.9, 8.15, 8.4), row(8.2, 8.45, 8.7, 8.95, 9.2), row(8.4, 8.65, 8.9, 9.15, 9.4), row(8.8, 9.05, 9.3, 9.55, 9.8), row(9, 9.25, 9.5, 9.75, 10)], // Broken Bone 부러진 뼈
	1237: [row(4.6, 4.8, 5, 5.2, 5.4), row(5.4, 5.6, 5.8, 6, 6.2), row(5.6, 5.8, 6, 6.2, 6.4), row(6, 6.2, 6.4, 6.6, 6.8), row(6.2, 6.4, 6.6, 6.8, 7)], // Shield Piercing 실드관통
	1134: [row(4, 4.16, 4.32, 4.48, 4.64), row(4.48, 4.64, 4.8, 4.96, 5.12), row(4.6, 4.76, 4.92, 5.08, 5.24), row(4.84, 5, 5.16, 5.32, 5.48), row(4.96, 5.12, 5.28, 5.44, 5.6)], // Drops of Ether 구슬동자
	1248: [row(1.68, 1.68, 1.89, 1.89, 2.1), row(1.98, 1.98, 2.19, 2.19, 2.4), row(2.06, 2.06, 2.27, 2.27, 2.48), row(2.21, 2.21, 2.42, 2.42, 2.63), row(2.28, 2.28, 2.49, 2.49, 2.7)], // Contender 승부사
	1236: [row(1.3, 1.38, 1.45, 1.53, 1.6), row(1.45, 1.53, 1.6, 1.68, 1.75), row(1.49, 1.57, 1.64, 1.72, 1.79), row(1.56, 1.64, 1.71, 1.79, 1.86), row(1.6, 1.68, 1.75, 1.83, 1.9)] // Crushing Fist 분쇄의 주먹
};
// Same curve shared by several engravings in [inven].
const SHARED_14 = [row(14, 14.75, 15.5, 16.25, 17), row(17, 17.75, 18.5, 19.25, 20), row(17.75, 18.5, 19.25, 20, 20.75), row(19.25, 20, 20.75, 21.5, 22.25), row(20, 20.75, 21.5, 22.25, 23)];
for (const id of [1238, 1253, 1111, 1247, 1297]) ENGRAVING_TABLE[id] = SHARED_14; // Master's Tenacity, Barricade, Stabilized Status, Cursed Doll, Hit Master

export const engravingTable = (id: number): number[][] | undefined => ENGRAVING_TABLE[id];
/** Every engraving with a DPS table (the ones a swap can pick). */
export const engravingIds = () => Object.keys(ENGRAVING_TABLE).map(Number);

export const ENGRAVING_NAMES: Record<number, string> = {
	1118: 'Grudge', 1299: 'Adrenaline', 1254: 'Raid Captain', 1295: 'Mass Increase', 1288: 'Master Brawler',
	1249: 'Ambush Master', 1141: 'Keen Blunt Weapon', 1300: 'All-Out Attack', 1121: 'Super Charge',
	1110: 'Ether Predator', 1168: 'MP Efficiency Increase', 1107: 'Disrespect', 1303: 'Precise Dagger',
	1296: 'Propulsion', 1251: 'Magick Stream', 1298: 'Sight Focus', 1245: 'Broken Bone', 1237: 'Shield Piercing',
	1134: 'Drops of Ether', 1248: 'Contender', 1236: 'Crushing Fist', 1238: "Master's Tenacity", 1253: 'Barricade',
	1111: 'Stabilized Status', 1247: 'Cursed Doll', 1297: 'Hit Master'
};

// ---------------------------------------------------------------------------------------------
// Accessories. Stat indices are bible's stat enum; values are in 1/100 % (260 = 2.6%).

export type Tier = 'low' | 'mid' | 'high';
export const TIERS: Tier[] = ['low', 'mid', 'high'];

export type AccessoryFamily = 'neck' | 'ear' | 'finger';

export interface AccessoryLine {
	key: string;
	name: string;
	/** Matches `items[].data.stats[]` by stat `type` + `index` (type 4 = combat effect, index ignored). */
	match: (s: { type: number; index: number }) => boolean;
	/** [game] value at low / mid / high. */
	values: Record<Tier, number>;
	/** Battle points for a line value. Absent when the line changes Weapon Power (and so base attack) instead. */
	toBattlePoints?: (v: number) => number;
	/** Lines that raise Weapon Power, which feeds base attack rather than a battle point part. */
	weapon?: 'percent' | 'flat';
	slots: AccessoryFamily[];
	/** The slot's two main DPS lines; the suggestions list only proposes these. */
	primary: boolean;
	/** Shown as a combat effect (type 17 part) rather than a grinding stat (type 15). */
	combatEffect?: boolean;
}

// Coefficients reproduce bible's numbers: neck Additional Damage 260 → 199.992, ring Crit Rate 95 → 73.549,
// ring Crit Damage 400 → 120, earring Atk. Power % 155 → 155, flat Atk. Power 80 → 5.6 [inven].
export const ACCESSORY_LINES: AccessoryLine[] = [
	{ key: 'add_dmg', name: 'Additional Damage', match: (s) => s.type === 2 && s.index === 50, values: { low: 70, mid: 160, high: 260 }, toBattlePoints: (v) => v * 0.7692, slots: ['neck'], primary: true },
	{ key: 'outgoing_dmg', name: 'Outgoing Damage', match: (s) => s.type === 4, values: { low: 55, mid: 120, high: 200 }, toBattlePoints: (v) => v, slots: ['neck'], primary: true, combatEffect: true },
	{ key: 'atk_pct', name: 'Atk. Power %', match: (s) => s.type === 2 && s.index === 49, values: { low: 40, mid: 95, high: 155 }, toBattlePoints: (v) => v, slots: ['ear'], primary: true },
	{ key: 'weapon_pct', name: 'Weapon Power %', match: (s) => s.type === 2 && s.index === 152, values: { low: 80, mid: 180, high: 300 }, weapon: 'percent', slots: ['ear'], primary: true },
	{ key: 'crit_rate', name: 'Crit Rate', match: (s) => s.type === 2 && s.index === 74, values: { low: 40, mid: 95, high: 155 }, toBattlePoints: (v) => v * 0.7742, slots: ['finger'], primary: true },
	{ key: 'crit_dmg', name: 'Crit Damage', match: (s) => s.type === 2 && s.index === 76, values: { low: 110, mid: 240, high: 400 }, toBattlePoints: (v) => v * 0.3, slots: ['finger'], primary: true },
	// Flat lines can roll on any accessory. Values here are whole numbers, not 1/100 %.
	{ key: 'atk_flat', name: 'Atk. Power', match: (s) => s.type === 2 && s.index === 124, values: { low: 80, mid: 195, high: 390 }, toBattlePoints: (v) => v * 0.07, slots: ['neck', 'ear', 'finger'], primary: false },
	{ key: 'weapon_flat', name: 'Weapon Power', match: (s) => s.type === 2 && s.index === 151, values: { low: 195, mid: 480, high: 960 }, weapon: 'flat', slots: ['neck', 'ear', 'finger'], primary: false }
];

/** [game] T4 accessory main stat range across polish levels 0–3 (lowest at 0, highest at 3). */
export const ACCESSORY_MAIN_STAT_RANGE: Record<AccessoryFamily, { min: number; max: number }> = {
	neck: { min: 12678, max: 17857 },
	ear: { min: 9861, max: 13889 },
	finger: { min: 9156, max: 12897 }
};

/** How a line's value reads in the UI. */
export const formatLineValue = (line: AccessoryLine, v: number) =>
	line.key === 'atk_flat' || line.key === 'weapon_flat'
		? `+${v}`
		: // Identity meter gain is stored as battle points (80 / 180 / 300 = +1.6 / 3.6 / 6%).
			`+${Number((line.key === 's_identity' ? v / 50 : v / 100).toFixed(2))}%`;

// ---------------------------------------------------------------------------------------------
// Karma [inven]

export const KARMA_EVOLUTION_PER_RANK = 60; // max rank 6
export const KARMA_EVOLUTION_MAX_RANK = 6;
export const KARMA_LEAP_PER_LEVEL = 2; // max level 30
export const KARMA_LEAP_MAX_LEVEL = 30;

// [game] Karma trees run levels 1–30; each tree ranks up on reaching these levels (rank 1 from level 1).
export const KARMA_MAX_LEVEL = 30;
const KARMA_RANK_UP_AT = [5, 9, 13, 17, 21];
export const karmaRank = (level: number) => (level <= 0 ? 0 : 1 + KARMA_RANK_UP_AT.filter((l) => level >= l).length);
/** Evolution karma: +400 Max HP per level. */
export const KARMA_EVOLUTION_HP_PER_LEVEL = 400;
/** Enlightenment karma: +0.1% Weapon Power per level. */
export const KARMA_ENLIGHTENMENT_WEAPON_PCT_PER_LEVEL = 0.1;
