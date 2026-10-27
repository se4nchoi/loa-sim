import { BOSS_SPECIES } from './boss-species-data';
import { gateBossesOf } from './raids';

export type DemonSpecies = 'demon' | 'archdemon' | 'other';

export function bossDemonSpecies(boss: string): DemonSpecies | null {
	const species = BOSS_SPECIES[boss];
	return species ? species === 'devil' ? 'demon' : species === 'archefiend' ? 'archdemon' : 'other' : null;
}

/** Never apply the final boss's race to a whole mixed-race gate (Kazeros G2, Aegir G1, …).
 * Known gates assume the player's scalable damage hits their listed bosses; adds aren't reconstructed. */
export function gateDemonSpecies(boss: string): DemonSpecies | null {
	const bosses = gateBossesOf(boss);
	if (!bosses) return null;
	const species = bosses.map(bossDemonSpecies);
	return species.every(s => s !== null && s === species[0]) ? species[0] : null;
}
