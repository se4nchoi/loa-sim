// What's new and what's known: the landing page's Updates card. Edit by hand when something ships or a report
// comes in; newest first. Dates are YYYY-MM-DD. `points` show as bullets when a line is unfolded.

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
		title: 'Astrogem WP',
		points: ['Pick any astrogem, even past the core’s Willpower: ones that don’t fit turn red and don’t count until the core has room (e.g. as Ancient)']
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

export const ISSUES: SiteIssue[] = [
	{
		status: 'known issue',
		title: 'CP lower than your gear',
		points: [
			'We only get two loadouts from lostark.bible, and neither may have your current gear',
			'Fix: equip it in game, swap characters, then hit ↻ on the character here'
		]
	},
	{
		status: 'planned',
		title: 'Pick from saved snapshots',
		points: ['Your browser will keep each snapshot you load, so you can switch between them instead of relying on what bible has right now']
	},
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
