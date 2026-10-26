// What's new and what's known: the landing page's Updates card. Edit by hand when something ships or a report
// comes in; newest first. Dates are YYYY-MM-DD. `points` show as bullets when a line is unfolded.
// Keep entries short: a few-word title that fits the card (~17 characters, e.g. "Character load UX") and one plain
// sentence per point saying what changed for the player (e.g. "Loading a character no longer sends you to the
// simulator page"), with no period. Group related fixes under one title with a bullet each.

export type UpdateKind = 'new' | 'improved' | 'fix';

export interface SiteUpdate {
	date: string;
	kind: UpdateKind;
	title: string;
	points?: string[];
}

export const UPDATES: SiteUpdate[] = [
	{
		date: '2026-10-26',
		kind: 'fix',
		title: 'Vambraces calc',
		points: ['Vambraces’ flat attack stats now count toward CP']
	},
	{
		date: '2026-10-24',
		kind: 'new',
		title: 'Market prices',
		points: [
			'Material prices can load current honing material and relic engraving book prices for your region from loa-buddy',
			'Undo an import any time; prices you type yourself still work'
		]
	},
	{
		date: '2026-10-21',
		kind: 'improved',
		title: 'Vambraces & books',
		points: [
			'Bracer is now called Vambraces, matching the global release, and is no longer marked as a KR preview',
			'Serca gear honing can now use Metallurgy and Tailoring: Tremor books from +12 to +19'
		]
	},
	{
		date: '2026-10-18',
		kind: 'fix',
		title: 'Simulator fix',
		points: ['Fixed simulator showing wrong engraving for saved snapshots in certain scenarios']
	},
	{
		date: '2026-10-17',
		kind: 'new',
		title: 'Character list',
		points: [
			'Reorder characters by drag and drop',
			'Pin simulations to a quick-access list for each character; pinned simulations preserve their original snapshot'
		]
	},
	{
		date: '2026-10-17',
		kind: 'new',
		title: 'Shareable links',
		points: [
			'Character links now load the character even if it is not saved in your browser',
			'Share your current simulation as a link that preserves its snapshot and changes; links expire after 30 days',
			'Sharing links replaces JSON export and import'
		]
	},
	{
		date: '2026-10-13',
		kind: 'new',
		title: 'Saved simulations',
		points: ['Save named simulations (saved to your browser)', 'Pin saved simulations to your character list for quick access']
	},
	{
		date: '2026-10-13',
		kind: 'improved',
		title: 'Honing',
		points: ['Added Hellfire books', 'Recommended strategies show average gold cost and success rate']
	},
	{
		date: '2026-10-13',
		kind: 'improved',
		title: 'Mobile',
		points: ['Price entry scrolling keeps the full accessory visible', 'Improved selector layout and accessory labels']
	},
	{
		date: '2026-10-13',
		kind: 'improved',
		title: 'Minor improvements',
		points: ['Improved price entering flow for upgrades and material inventory', 'Some mobile UI improvements']
	},
	{
		date: '2026-10-12',
		kind: 'improved',
		title: 'Faster switching',
		points: [
			'Switching snapshots is about 5× faster, with a spinner while the new one loads',
			'Suggested stone kit engravings open right away and fill in a moment later'
		]
	},
	{
		date: '2026-10-12',
		kind: 'fix',
		title: 'UI fixes',
		points: [
			'Menus on iPhone no longer stretch tall with big empty rows',
			'The snapshot menu fits on a phone screen and closes as soon as you pick',
			'The snapshot button reads "Snapshot on MM-DD" with its CP; the menu has the full names',
			'lostark.bible’s two loadouts are now "Latest bible snapshot" and "Bible best gear seen", with a lock: they follow bible and can’t be erased',
			'Astrogem Willpower and points pickers fit on one line on phones, and show each choice’s CP change'
		]
	},
	{
		date: '2026-10-12',
		kind: 'improved',
		title: 'Ark Grid sim',
		points: [
			'Max on the Ark Grid: every core Ancient with the best astrogems',
			'Max on a core: Ancient, first-tier option, best astrogems that fit its Willpower',
			'Max on an astrogem: that type maxed, without changing the core',
			'While a core is over its Willpower, Next Upgrades skips Ark Grid suggestions until you free some up'
		]
	},
	{
		date: '2026-10-12',
		kind: 'new',
		title: 'Saved snapshots',
		points: [
			'lostark.bible only keeps your latest snapshots, so gear you swapped out used to be gone; now every snapshot you load is kept in your browser',
			'Up to 8 per character (the oldest go first); the same gear at the same CP isn’t saved twice',
			'Pick or delete them from the snapshot menu under your character’s name',
			'↻ next to that menu reloads your character from lostark.bible without leaving the simulator'
		]
	},
	{
		date: '2026-10-12',
		kind: 'improved',
		title: 'Astrogem WP',
		points: ['You can pick astrogems over the core’s Willpower to plan ahead; they show red and don’t count until the core can power them']
	},
	{
		date: '2026-10-12',
		kind: 'improved',
		title: 'Character load UX',
		points: ['Loading a character keeps you on the Characters tab, so you can load several in a row']
	},
	{
		date: '2026-10-12',
		kind: 'fix',
		title: 'Mobile UI',
		points: [
			'Menus no longer grow as you scroll or run off the screen',
			'Max / Reset no longer jump down when the CP change appears',
			'The header and CP bar stay in place when Next Upgrades opens'
		]
	},
	{
		date: '2026-10-11',
		kind: 'new',
		title: 'CP Breakdown',
		points: [
			'Press ? on the CP Simulator card to see how your CP is made up: base attack, then each section’s bonus and its share of your CP',
			'Sections are grouped into Character, Gear and Systems, and base attack shows what +1% main stat, Weapon Power or Atk. adds'
		]
	},
	{
		date: '2026-10-11',
		kind: 'new',
		title: 'Paradise orbs',
		points: ['Swap orbs and try different Paradise power to see the CP change; each orb scales with its own season’s power']
	},
	{ date: '2026-10-11', kind: 'improved', title: 'Faster simulator', points: ['CP recalculates once you stop changing things, so sliders and steppers stay responsive'] },
	{ date: '2026-10-11', kind: 'fix', title: 'iPhone zoom', points: ['Tapping a field no longer zooms the page in'] },
	{ date: '2026-10-10', kind: 'new', title: 'Skin upgrades', points: ['Skins add main stat (Legendary: +2% per piece), so they show up in Next Upgrades with gold prices'] },
	{ date: '2026-10-10', kind: 'new', title: 'Equipment quality', points: ['Try higher quality on your gear and see the CP and the cost'] },
	{ date: '2026-10-10', kind: 'new', title: 'Gem tier swaps', points: ['Switch gems between T3 and T4 to see what moving a gem to T4 is worth'] },
	{ date: '2026-10-10', kind: 'fix', title: 'Gem skill icons', points: ['Guardian Knight and Asura gem skills showed the wrong icons'] },
	{ date: '2026-10-09', kind: 'new', title: 'Change budget', points: ['The Budget button adds up the gold cost of everything you’ve changed, using your material prices and bound mats'] },
	{ date: '2026-10-09', kind: 'new', title: 'Accessory rolls', points: ['Choose which roll combos All Upgrades compares (H-H, H-M, …), so it matches what you’d actually buy'] },
	{ date: '2026-10-09', kind: 'improved', title: 'Phone layout', points: ['CP stays pinned at the top, and Next Upgrades opens from the bottom'] }
];

export type IssueStatus = 'in progress' | 'planned' | 'known issue' | 'investigating';

export interface SiteIssue {
	status: IssueStatus;
	title: string;
	points?: string[];
}

// Resolved (kept here, not shown; these aren't GitHub issues):
// - 2026-10-12 "CP lower than your gear" (known issue: bible lists only two loadouts, neither may have your gear) and
//   "Pick from saved snapshots" (planned): both resolved by Saved snapshots (snapshot-history.ts).
// - 2026-10-24 "Market API" (in progress): shipped as the market price import in Material prices (loa-buddy approved).
export const ISSUES: SiteIssue[] = [
	{
		status: 'investigating',
		title: 'Pet ranch CP',
		points: ['The collection counts as +0.77% CP; working out how its main stat, damage and HP bonuses add up to that']
	},
	{
		status: 'planned',
		title: 'DPS / support score',
		points: ['Rank upgrades by actual damage (or buffs) per gold, like Lopec, instead of CP']
	},
	{
		status: 'planned',
		title: 'Paradise items',
		points: ['Ancient items (Lv. 18, 1-star, 2-star), resonance tiers and support orbs']
	}
];

export const ISSUES_URL = 'https://github.com/se4nchoi/loa-sim/issues';
export const NEW_ISSUE_URL = 'https://github.com/se4nchoi/loa-sim/issues/new';
