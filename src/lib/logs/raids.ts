// Raid and gate for a LOA Logs encounter, from its boss name. Boss names per gate follow LOA Logs'
// encounter map (snoww/loa-logs, src/lib/constants/encounters.ts); a name that appears in several raids
// (e.g. Phantom Legion Commander Brelshaza) belongs to the newest one.

/** [raid label, gates in order, each a list of boss names]. Newest raids last. */
const RAIDS: [raid: string, gates: string[][]][] = [
	['Valtan', [['Dark Mountain Predator', 'Destroyer Lucas', 'Leader Lugaru'], ['Demon Beast Commander Valtan', 'Ravaged Tyrant of Beasts']]],
	['Vykas', [['Incubus Morphe', 'Nightmarish Morphe'], ['Covetous Devourer Vykas'], ['Covetous Legion Commander Vykas']]],
	['Kakul-Saydon', [['Saydon'], ['Kakul'], ['Kakul-Saydon', 'Encore-Desiring Kakul-Saydon']]],
	[
		'Brelshaza (Legion)',
		[
			['Gehenna Helkasirs'],
			['Prokel', "Prokel's Spiritual Echo", 'Ashtarot'],
			['Primordial Nightmare'],
			['Phantom Legion Commander Brelshaza'],
			['Brelshaza, Monarch of Nightmares', 'Imagined Primordial Nightmare', 'Pseudospace Primordial Nightmare'],
			['Phantom Legion Commander Brelshaza']
		]
	],
	['Kayangel', [['Tienis'], ['Prunya'], ['Lauriel']]],
	['Akkan (Legion)', [['Griefbringer Maurug', 'Evolved Maurug'], ['Lord of Degradation Akkan'], ['Plague Legion Commander Akkan', 'Lord of Kartheon Akkan']]],
	[
		'Ivory Tower',
		[
			['Kaltaya, the Blooming Chaos'],
			['Rakathus, the Lurking Arrogance'],
			['Firehorn, Trampler of Earth'],
			['Lazaram, the Trailblazer', 'Subordinated Vertus', 'Subordinated Calventus', 'Subordinated Legoros', 'Brand of Subordination']
		]
	],
	[
		'Thaemine',
		[
			['Killineza the Dark Worshipper'],
			['Valinak, Knight of Darkness', 'Valinak, Taboo Usurper', 'Valinak, Herald of the End'],
			['Thaemine the Lightqueller', 'Dark Greatsword'],
			['Darkness Legion Commander Thaemine', 'Thaemine Prokel', 'Thaemine, Conqueror of Stars']
		]
	],
	['Echidna', [['Red Doom Narkiel', 'Agris'], ['Echidna', 'Covetous Master Echidna', 'Desire in Full Bloom, Echidna', 'Alcaone, the Twisted Venom', 'Agris, the Devouring Bog']]],
	[
		'Behemoth',
		[
			['Behemoth, the Storm Commander', 'Despicable Skolakia', 'Untrue Crimson Yoho', 'Ruthless Lakadroff', 'Vicious Argeos'],
			['Behemoth, Cruel Storm Slayer']
		]
	],
	['Assault: Crimson Abyss', [['Abyssal Beast, Narhash']]],
	['Assault: Flame of Destruction', [['Flame of Darkness, Tarkal']]],
	['Aegir (Act 1)', [['Akkan, Lord of Death', 'Abyss Monarch Aegir'], ['Aegir, the Oppressor', "Pulsating Giant's Heart"]]],
	['Brelshaza (Act 2)', [['Narok the Butcher'], ['Phantom Legion Commander Brelshaza', 'Phantom Manifester Brelshaza']]],
	[
		'Mordum (Act 3)',
		[['Thaemine, Master of Darkness', 'Infernas'], ['Blossoming Fear, Naitreya'], ['Mordum, the Abyssal Punisher', "Mordum's Hammer", 'Flash of Punishment']]
	],
	['Armoche (Act 4)', [['Act 4: Covetous Master Echidna', 'Brelshaza, Ember in the Ashes'], ['Armoche, Sentinel of the Abyss']]],
	['Kazeros (Final Act)', [['Abyss Lord Kazeros', 'Abyssal Afterimage'], ['Archdemon Kazeros', 'Death Incarnate Kazeros']]],
	['Serca', [['Witch of Agony, Serca'], ['Corvus Tul Rak']]],
	['Horizon Cathedral', [['Archbishop Arcenos'], ['Arcenos, Vanguard of Fanaticism']]]
];

export interface RaidGate {
	/** "Armoche (Act 4)" */
	raid: string;
	/** 1-based gate number. */
	gate: number;
	/** "Armoche G1 (Act 4)" */
	label: string;
	/** Position of the raid in release order (newest highest), for sorting. */
	order: number;
}

const gateLabel = (raid: string, gate: number) => {
	const m = raid.match(/^(.*?) \((.*)\)$/);
	return m ? `${m[1]} G${gate} (${m[2]})` : `${raid} G${gate}`;
};

const BY_BOSS = new Map<string, RaidGate>();
RAIDS.forEach(([raid, gates], order) =>
	gates.forEach((bosses, i) => {
		for (const boss of bosses) BY_BOSS.set(boss, { raid, gate: i + 1, label: gateLabel(raid, i + 1), order });
	})
);

/** The raid and gate a boss belongs to, or null for bosses outside the list (guardians, trials, new raids). */
export const raidGateOf = (boss: string): RaidGate | null => BY_BOSS.get(boss) ?? null;
