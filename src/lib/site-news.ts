// What's new and what's known: the landing page's Updates card. Edit by hand when something ships or a report
// comes in; newest first. Dates are YYYY-MM-DD. `points` show as bullets when a line is unfolded.
// Keep entries short: a few-word title that fits the card (~17 characters, e.g. "Character load UX") and one plain
// sentence per point saying what changed for the player (e.g. "Loading a character no longer sends you to the
// simulator page"). Group related fixes under one title with a bullet each.

export type UpdateKind = 'new' | 'improved' | 'fix';

export interface SiteUpdate {
	date: string;
	kind: UpdateKind;
	title: string;
	points?: string[];
}

export const UPDATES: SiteUpdate[] = [
	{
		date: '2026-10-12',
		kind: 'improved',
		title: 'Snapshot menu',
		points: [
			'Switching snapshots is about 5× faster, and the menu closes right away',
			'The button always reads "Snapshot on MM-DD" with its CP, so it no longer jumps',
			'"Estimated raid loadout" is now "Best gear seen"'
		]
	},
	{
		date: '2026-10-12',
		kind: 'fix',
		title: 'iPhone menus',
		points: [
			'Menus no longer stretch tall with big empty rows on iPhone',
			'The snapshot menu fits on the screen',
			'Show / Hide on the CP bar no longer shifts the bar'
		]
	},
	{
		date: '2026-10-12',
		kind: 'improved',
		title: 'Ark Grid sim',
		points: [
			'Max on the Ark Grid: every core Ancient with the best astrogems',
			'Max on a core: Ancient, first-tier option, best astrogems that fit',
			'Max on an astrogem: that type maxed, without changing the core',
			'Next Upgrades leaves out the Ark Grid while a core is over its Willpower'
		]
	},
	{
		date: '2026-10-12',
		kind: 'fix',
		title: 'Minor UI fixes',
		points: ['Astrogem Willpower and points pickers fit on one line on phones', 'Willpower efficiency picker uses compact cells with the CP change']
	},
	{
		date: '2026-10-12',
		kind: 'new',
		title: 'Saved snapshots',
		points: [
			'Every snapshot you load is now saved in your browser, up to 8 per character; past 8, the oldest is pruned',
			'Same gear with the same CP counts as a duplicate and isn’t saved',
			'Pick between or delete saved snapshots in the Simulator tab, under your character’s name'
		]
	},
	{
		date: '2026-10-12',
		kind: 'improved',
		title: 'Astrogem WP',
		points: ['Astrogems over the core’s Willpower can be picked; they show red and don’t count']
	},
	{
		date: '2026-10-12',
		kind: 'improved',
		title: 'Character load UX',
		points: ['Loading a character no longer sends you to the simulator page']
	},
	{
		date: '2026-10-12',
		kind: 'fix',
		title: 'Mobile UI',
		points: [
			'Menus no longer grow as you scroll or run off the screen',
			'Smaller core point and gem tier pickers',
			'Max / Reset no longer jump down when the CP change appears',
			'The header and CP bar stay in place when Next Upgrades opens'
		]
	},
	{
		date: '2026-10-11',
		kind: 'new',
		title: 'CP Breakdown',
		points: ['Press ? on the CP Simulator card to see what makes up your CP, and how much each part adds']
	},
	{
		date: '2026-10-11',
		kind: 'new',
		title: 'Paradise orbs',
		points: ['Swap orbs and try different Paradise power to see the CP change']
	},
	{ date: '2026-10-11', kind: 'improved', title: 'Faster simulator', points: ['Less lag when changing lots of things at once'] },
	{ date: '2026-10-11', kind: 'fix', title: 'iPhone zoom', points: ['Tapping a field no longer zooms in'] },
	{ date: '2026-10-10', kind: 'new', title: 'Skin upgrades', points: ['Skins show up in Next Upgrades, with gold prices'] },
	{ date: '2026-10-10', kind: 'new', title: 'Equipment quality', points: ['Try different quality on your gear and see the cost'] },
	{ date: '2026-10-10', kind: 'new', title: 'Gem tier swaps', points: ['Switch gems between T3 and T4'] },
	{ date: '2026-10-10', kind: 'fix', title: 'Gem skill icons', points: ['Guardian Knight and Asura icons were wrong'] },
	{ date: '2026-10-09', kind: 'new', title: 'Change budget', points: ['See how much gold all your simulated changes would cost'] },
	{ date: '2026-10-09', kind: 'new', title: 'Accessory roll picker', points: ['Pick which rolls to look at in All Upgrades (H-H, H-M, …)'] },
	{ date: '2026-10-09', kind: 'improved', title: 'Phone layout', points: ['CP stays pinned up top, Next Upgrades opens from the bottom'] }
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
