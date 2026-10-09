import type { SimState } from '../simulate';

export const selectClass = (changed: boolean) =>
	`h-8 rounded-xs border bg-surface-950 px-2 text-sm text-surface-100 hover:border-surface-500 focus:outline-none focus:border-accent-500 ${
		changed ? 'border-accent-500 bg-accent-500/10' : 'border-surface-700'
	}`;

export const linkButtonClass = 'text-surface-300 underline hover:text-surface-50';

/** Solid compact button (section actions like "All Lv. 10"). */
export const btn =
	'inline-flex h-7 items-center justify-center rounded-xs border border-surface-700 bg-surface-800 px-2.5 text-xs font-semibold text-surface-100 transition hover:border-surface-500 hover:bg-surface-700 active:bg-surface-600';
/** Accent variant for the main action in a group. */
export const btnAccent =
	'inline-flex h-7 items-center justify-center rounded-xs border border-accent-700 bg-accent-700/30 px-2.5 text-xs font-semibold text-accent-100 transition hover:bg-accent-700/50';

export const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Simulator sections and the parts of the state each one owns. */
export const SECTIONS = {
	gear: ['gear', 'sidereal', 'bracer'],
	accessories: ['accessories', 'accessoryStats'],
	bracelet: ['bracelet'],
	skins: ['skins'],
	gems: ['gems'],
	engravings: ['engravings'],
	arkGrid: ['arkGrid'],
	karma: ['karma']
} as const satisfies Record<string, readonly (keyof SimState)[]>;
export type SimSection = keyof typeof SECTIONS;

/** A section's effect on CP: percent, and raw Combat Power at the current score. */
export interface SectionDelta {
	pct: number;
	cp: number;
}

export interface PickOption {
	value: string;
	label: string;
	color: string;
	group?: string;
}

/** lostark.bible's roll colors for accessory lines (high / mid / low), plus grey for lines with no DPS value. */
export const ROLL_COLORS = { high: '#EA6811', mid: '#DF18E3', low: '#1260EB', none: '#575757' } as const;
/** Bracelet effects have four grades; the top three reuse the roll colors. */
export const GRADE_COLORS = [ROLL_COLORS.high, ROLL_COLORS.mid, ROLL_COLORS.low, '#8a8a8a'];

/** CP change (percent) of a hypothetical edit, given by the simulator. */
export type PreviewEdit = (mutate: (s: SimState) => void) => number;

export interface MenuOption<V> {
	value: V;
	label: string;
	/** Image shown before the label (e.g. a skill icon). */
	iconUrl?: string;
	/** Built-in mark shown before the label. */
	glyph?: 'relic' | 'stone';
	color?: string;
	muted?: boolean;
	/** Visible but unavailable, e.g. an astrogem exceeding the core's Willpower. */
	disabled?: boolean;
	title?: string;
	/** Options sharing a row label are laid out as one row (e.g. astrogem option type × level 1–5). */
	row?: string;
}

/** Text colors matching the engraving marks: relic orange and ability-stone cyan. */
export const RELIC_COLOR = '#ff8a2a';
export const STONE_COLOR = '#5fdcf5';
