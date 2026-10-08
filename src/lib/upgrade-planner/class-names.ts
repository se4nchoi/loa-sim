// lostark.bible class ids are the game's internal names ("dragon_knight", "infighter_male"); players know the
// NA names. Keys are compared without underscores, since bible and the skill data spell some differently.

const NA_NAMES: Record<string, string> = {
	berserker: 'Berserker',
	berserkerfemale: 'Slayer',
	warlord: 'Gunlancer',
	destroyer: 'Destroyer',
	holyknight: 'Paladin',
	holyknightfemale: 'Valkyrie',
	dragonknight: 'Guardianknight',
	battlemaster: 'Wardancer',
	infighter: 'Scrapper',
	forcemaster: 'Soulfist',
	lancemaster: 'Glaivier',
	battlemastermale: 'Striker',
	infightermale: 'Breaker',
	arcana: 'Arcanist',
	summoner: 'Summoner',
	bard: 'Bard',
	elementalmaster: 'Sorceress',
	blade: 'Deathblade',
	demonic: 'Shadowhunter',
	reaper: 'Reaper',
	souleater: 'Souleater',
	hawkeye: 'Sharpshooter',
	devilhunter: 'Deadeye',
	devilhunterfemale: 'Gunslinger',
	blaster: 'Artillerist',
	scouter: 'Machinist',
	yinyangshi: 'Artist',
	weatherartist: 'Aeromancer',
	alchemist: 'Wildsoul',
	dimensionmaster: 'Dimensionalist'
};

/** bible class key (no underscores) for an NA class name ("Souleater" → "souleater"), or undefined. */
export const classKeyFromName = (name: string) =>
	Object.entries(NA_NAMES).find(([, na]) => na.toLowerCase() === name.replaceAll(' ', '').toLowerCase())?.[0];

/** NA class name for a bible class id; unknown ids fall back to a readable form of the id. */
export const className = (classId: string) =>
	NA_NAMES[classId.replaceAll('_', '').toLowerCase()] ??
	classId
		.split('_')
		.map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
		.join(' ');
