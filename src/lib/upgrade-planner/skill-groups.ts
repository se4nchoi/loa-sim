// Which skill group each class skill belongs to, for Ark Grid core effects like "Stygian Skill Damage +0.6%".
// LOA Logs, the Maxroll feed and the game's skill data used here don't carry these groups, so they're listed per class.
// Source: each skill's tag on lostarkcodex.com ("[Deathlord Skill]"), collected 10-19-26. Skill ids match LOA Logs'.
// Status: Souleater confirmed by a Souleater player (10-19-26). Other classes follow once the Souleater model checks out.

export type SkillGroup = string;

/** Class → skill id → group ("Stygian", "Ghast", "Deathlord"). Skills without a group (awakenings) are left out. */
export const SKILL_GROUPS: Record<string, Record<number, SkillGroup>> = {
	souleater: {
		// Stygian
		46430: 'Stygian', // Astaros
		46410: 'Stygian', // Death Order
		46450: 'Stygian', // Death Yard
		46400: 'Stygian', // Gluttony
		46440: 'Stygian', // Soul Drain
		46420: 'Stygian', // Spectral Coffin
		// Ghast
		46650: 'Ghast', // Frenzy Scythe
		46240: 'Ghast', // Ghost Step
		46200: 'Ghast', // Harvest
		46250: 'Ghast', // Lethal Spinning
		46210: 'Ghast', // Lunatic Edge
		46220: 'Ghast', // Rusted Nail
		46230: 'Ghast', // Thrashing
		// Deathlord
		46510: 'Deathlord', // Death Slash
		46640: 'Deathlord', // Fatal Finale
		46520: 'Deathlord', // Guillotine Swing
		46500: 'Deathlord', // Reaper's Scythe
		46530: 'Deathlord' // Vestige
		// No group (awakenings): 46600 Deathbringer, 46610 The End, 46620 Deadly Combination, 46630 Fatality
	}
};
