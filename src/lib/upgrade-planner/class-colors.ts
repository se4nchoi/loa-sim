// LOA Logs' default class colours (its meter, charts and damage table), so the DPS tab's skill bars match what players
// see in the meter. Values from snoww/loa-logs `defaultClassColors` (src/lib/stores.svelte.ts, 2026-10-10); players can
// change them in LOA Logs, which we can't read. Keys are the NA class names from class-names.ts.
import { className } from './class-names';

const CLASS_COLORS: Record<string, string> = {
	Berserker: '#ee2e48', Destroyer: '#7b9aa2', Gunlancer: '#e1907e', Paladin: '#ff9900', Slayer: '#db6a42',
	Valkyrie: '#ffbf00', Arcanist: '#b38915', Summoner: '#22aa99', Bard: '#674598', Sorceress: '#66aa00',
	Wardancer: '#aaaa11', Scrapper: '#990099', Soulfist: '#316395', Glaivier: '#f6da6a', Striker: '#994499',
	Breaker: '#4de3d1', Deathblade: '#a91a16', Shadowhunter: '#0099c6', Reaper: '#109618', Souleater: '#c16ed0',
	Sharpshooter: '#dd4477', Deadeye: '#4442a8', Artillerist: '#33670b', Machinist: '#3b4292', Gunslinger: '#6bcec2',
	Artist: '#a34af0', Aeromancer: '#084ba3', Wildsoul: '#3a945e', Dimensionalist: '#8b7cf8', Guardianknight: '#f4554b'
};

/** The meter's colour for a bible class id, or undefined for a class it doesn't list. */
export const classColor = (classId: string): string | undefined => CLASS_COLORS[className(classId)];
