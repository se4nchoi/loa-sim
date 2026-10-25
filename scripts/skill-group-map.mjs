// Skill groups as Ark Grid core effects name them ("Stygian Skill Damage +3%"), mapped onto the game's skill data in
// the Maxroll feed (cache/maxroll-skills.json): a skill's `category` is its class group, its `type` its kind.
// Category names: one lostarkcodex.com skill page per category, its "[Stygian Skill]"-style tag (looked up 10-22-26).
// Core effects sometimes word a group differently than Codex; the core's wording is used here (Shadowhunter's
// "Encroachment" is Codex's "Intrude"). Sorceress's element categories carry no tag; named after their skills (Blaze,
// Lightning Vortex, Ice Shower).

/** Class → group name (as core effects write it) → Maxroll skill categories. */
export const CATEGORY_GROUPS = {
	alchemist: { Shapeshift: [65, 66], Bear: [65], Fox: [66], 'Phantom Beast': [64] },
	arcana: { Normal: [28], Ruin: [30] },
	battlemaster: { Normal: [8], Esoteric: [9] },
	battlemaster_male: { Normal: [8], Esoteric: [9] },
	berserker: { Normal: [1] },
	berserker_female: { Normal: [1] },
	blade: { Normal: [50] },
	blaster: { Normal: [22], Barrage: [23] },
	demonic: { Normal: [38], Encroachment: [39], Demon: [40] },
	destroyer: { 'Gravity Release': [7] },
	devilhunter: { Handgun: [19], Shotgun: [20], Rifle: [21] },
	devilhunter_female: { Handgun: [19], Shotgun: [20], Rifle: [21] },
	dimensionmaster: { 'Hour Hand': [76], 'Minute Hand': [77], Fusion: [78] },
	dragonknight: { Normal: [72], Manifestation: [73], Incarnation: [74] },
	elementalmaster: { Normal: [51], Fire: [52], Lightning: [53], Frost: [54] },
	// "Supreme Art Form": the forms of Supreme Art, the non-Robust Spirit Soulfist's Z skill (Supreme Technique / Palm /
	// Godfist), confirmed by a Soulfist player (10-25-26).
	forcemaster: { 'Martial Art': [13], Force: [79], 'Supreme Art Form': [80] },
	hawkeye: { Normal: [24] },
	holyknight_female: { Justice: [67], 'Holy Blade': [68] },
	infighter: { Stamina: [11], Shock: [12] },
	infighter_male: { Stamina: [11], Shock: [12] },
	lancemaster: { Flurry: [16], Focus: [17] },
	reaper: { Dagger: [43], Swoop: [45] },
	// "Sync-type": the skills used in Hypersync, and the suit skills (Sonic Impact, Quantum Assembly Beam) the suit cores name.
	scouter: { Normal: [46], Hypersync: [48], Joint: [49], Sync: [48, 75] },
	souleater: { Stygian: [61], Ghast: [62], Deathlord: [63] },
	summoner: { Normal: [26], 'Ancient Elemental': [27], Summon: [60] },
	warlord: { Normal: [3], Gunlance: [41] },
	weatherartist: { Umbrella: [58], Weather: [59] },
	// The "Paint:" and "Stroke:" skills.
	yinyangshi: { Paint: [55] }
};

/** Skill kinds by Maxroll `type` (checked against Codex's skill type labels). */
export const TYPE_GROUPS = { Point: 2, Charge: 3, Holding: 4, Combo: 5, Chain: 6, Casting: 11 };

/**
 * One class's own words for skill kinds. Sorceress cores word them as modes: her skills' own text says "In Normal Mode"
 * for type 1; "Casting Control" is read as her Casting skills (Doomsday, Explosion, Punishing Strike, Lava Blast), the
 * best match the data has.
 */
export const CLASS_TYPE_GROUPS = { elementalmaster: { 'Normal Mode': 1, 'Point Mode': 2, 'Casting Control': 11 } };

/**
 * Groups a class's cores name that are a set of skills, not a category or type (skill names). Guardian Knight's "Charge
 * Mode" skills are the three its own core text lists ("Quake Smash, Piercing Shock, and Rending Finisher's Charge Mode
 * Damage"); its "Charging" and "Charge" skills are the same (it has no Charge-type skill), checked on a run (10-25-26).
 */
export const NAMED_GROUPS = {
	dragonknight: Object.fromEntries(['Charge Mode', 'Charging', 'Charge'].map((g) => [g, ['Quake Smash', 'Piercing Shock', 'Rending Finisher']]))
};

/** Skills core effects name differently from the skill data: class → the effect's name → the skill name(s). */
export const SKILL_ALIASES = {
	// The only Asura basic attack in the data.
	infighter_male: { 'Asura War Basic Attack': 'Asura Destruction Basic Attack' },
	// A Basic Attack in Hypergravity is the enhanced one (a Destroyer player, 10-25-26): both.
	destroyer: { 'Basic Attack': ['Basic Attack', 'Hypergravity Basic Attack'] }
};

/** Group names a class's core effects can use. */
export const groupNames = (cls) => [...Object.keys(CATEGORY_GROUPS[cls] ?? {}), ...Object.keys(TYPE_GROUPS), ...Object.keys(CLASS_TYPE_GROUPS[cls] ?? {}), ...Object.keys(NAMED_GROUPS[cls] ?? {})];
