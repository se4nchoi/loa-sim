// How each raid looks on the DPS tab's cards: official key art from lostark.game.onstove.com/Artwork, kept here as
// small copies (static/raids/<raid>-640.jpg and -1280.jpg, made from the 3840x2160 originals, collected 10-14-26), else
// a color per raid. Mordum (Act 3) has no Artwork entry and uses its update page's art from the game's CDN.
// `position` keeps the boss in view when the art is cropped to a card or the banner.

interface Layer { src: string; size: string; position: string }
const local = (raid: string, position: string): Layer[] => [{ src: raid, size: 'cover', position }];
const ART: Record<string, Layer[]> = {
	Kazeros: local('kazeros', '50% 30%'),
	Armoche: local('armoche', '35% 30%'),
	Aegir: local('aegir', '55% 25%'),
	Brelshaza: local('brelshaza', '58% 25%'),
	'Horizon Cathedral': local('cathedral', '50% 20%'),
	Serca: local('serca', '62% 15%'),
	Behemoth: local('behemoth', '45% 35%'),
	Echidna: local('echidna', '50% 18%'),
	Thaemine: local('thaemine', '55% 35%'),
	Mordum: [{ src: 'https://cdn-lostark.game.onstove.com/2026/event/260923_update_C4XgyQie/images/pc/slide1.webp', size: 'cover', position: '30% 40%' }]
};

/** One layer's image: the small copy (and its 2x for sharp screens), or a full URL as is. */
const image = (src: string) =>
	src.startsWith('https://') ? `url("${src}")` : `image-set(url("/raids/${src}-640.jpg") 1x, url("/raids/${src}-1280.jpg") 2x)`;

/** Raid (card name) → CSS background (image, size, position) of its art, when one is known. */
export function raidArt(name: string): string | undefined {
	const layers = ART[name];
	if (!layers) return undefined;
	return [
		`background-image: ${layers.map((l) => image(l.src)).join(', ')}`,
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
	// A solid dark chip, so the label reads on any raid art.
	const chip = 'bg-black/80 ring-1';
	if (/nightmare/i.test(difficulty)) return `${chip} text-fuchsia-300 ring-fuchsia-400/50`;
	if (/hard|extreme/i.test(difficulty)) return `${chip} text-amber-300 ring-amber-400/50`;
	if (/level 3/i.test(difficulty)) return `${chip} text-red-300 ring-red-400/50`;
	return `${chip} text-surface-200 ring-surface-400/40`;
}
