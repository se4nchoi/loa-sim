// How each raid looks on the DPS tab's cards: lostark.bible's raid header art where it has one (the banner on its log
// pages, checked 10-14-26), else a color per raid. The game CDN's icon atlas and LOA Logs' data have no raid art.

const HEADERS: Record<string, string> = {
	Kazeros: 'kazeros', Serca: 'serca', 'Horizon Cathedral': 'cathedral', Armoche: 'armoche', Mordum: 'mordum', Aegir: 'aegir',
	Behemoth: 'behemoth', Echidna: 'echidna', Thaemine: 'thaemine', Valtan: 'valtan', Vykas: 'vykas', Hanumatan: 'hanumatan'
};

/** Raid (card name) → banner image, when one is known. */
export const raidImage = (name: string): string | undefined => (HEADERS[name] ? `https://lostark.bible/i/headers/${HEADERS[name]}.jpg` : undefined);

// Full class strings so Tailwind keeps them.
const TONES = [
	'bg-rose-950 border-rose-800/70 text-rose-200',
	'bg-amber-950 border-amber-800/70 text-amber-200',
	'bg-emerald-950 border-emerald-800/70 text-emerald-200',
	'bg-sky-950 border-sky-800/70 text-sky-200',
	'bg-violet-950 border-violet-800/70 text-violet-200',
	'bg-fuchsia-950 border-fuchsia-800/70 text-fuchsia-200',
	'bg-teal-950 border-teal-800/70 text-teal-200',
	'bg-orange-950 border-orange-800/70 text-orange-200'
];

const KNOWN: Record<string, number> = { 'Horizon Cathedral': 3, Serca: 4, Kazeros: 0, Armoche: 6, Mordum: 7, Brelshaza: 5, Aegir: 2 };

/** Same raid, same color, every visit. */
export function raidTone(name: string): string {
	const known = KNOWN[name];
	if (known !== undefined) return TONES[known];
	let h = 0;
	for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
	return TONES[h % TONES.length];
}

/** Difficulty badge colors, like lostark.bible's. */
export function difficultyTone(difficulty: string): string {
	if (/nightmare/i.test(difficulty)) return 'bg-fuchsia-500/20 text-fuchsia-300';
	if (/hard|extreme/i.test(difficulty)) return 'bg-amber-500/20 text-amber-300';
	if (/level 3/i.test(difficulty)) return 'bg-red-500/20 text-red-300';
	return 'bg-surface-700 text-surface-200';
}
