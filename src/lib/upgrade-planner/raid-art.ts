// How each raid looks on the DPS tab's cards: official art from the game's Korean update pages (the same Smilegate CDN
// the item icons come from; collected 10-14-26), else a color per raid. Each raid is one or more background layers,
// top first; `size` and `position` keep the boss in view on every card shape (position is relative to the image, so
// Aegir and Brelshaza can share one banner: it's zoomed in on its left and right halves).

const CDN = 'https://cdn-lostark.game.onstove.com';

interface Layer { src: string; size: string; position: string }
const ART: Record<string, Layer[]> = {
	'Horizon Cathedral': [{ src: '2026/event/260318_update_Bw4Xam3S/images/pc/bg_index_1.webp', size: 'cover', position: '50% 30%' }],
	Serca: [
		{ src: '2026/event/260107_update_jRkCIXJ9/images/pc/@serca.webp', size: 'auto 160%', position: '75% 15%' },
		{ src: '2026/event/260107_update_jRkCIXJ9/images/pc/bg_index.webp', size: 'cover', position: '80% 40%' }
	],
	Kazeros: [{ src: '2026/event/260923_update_C4XgyQie/images/pc/slide2_1.webp', size: 'cover', position: '50% 40%' }],
	Mordum: [{ src: '2026/event/260923_update_C4XgyQie/images/pc/slide1.webp', size: 'cover', position: '30% 40%' }],
	Armoche: [{ src: '2025/event/250820_update_7kUfourth/images/pc/@event2_img1.webp', size: 'cover', position: '50% 35%' }],
	Aegir: [{ src: '2026/event/260422_update_oEFIvZBF/images/pc/bg_index.webp', size: 'auto 230%', position: '25% 20%' }],
	Brelshaza: [{ src: '2026/event/260422_update_oEFIvZBF/images/pc/bg_index.webp', size: 'auto 230%', position: '72% 20%' }]
};

/** Raid (card name) → CSS background (image, size, position) of its official art, when one is known. */
export function raidArt(name: string): string | undefined {
	const layers = ART[name];
	if (!layers) return undefined;
	return [
		`background-image: ${layers.map((l) => `url("${CDN}/${l.src}")`).join(', ')}`,
		`background-size: ${layers.map((l) => l.size).join(', ')}`,
		`background-position: ${layers.map((l) => l.position).join(', ')}`,
		'background-repeat: no-repeat'
	].join('; ');
}

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
