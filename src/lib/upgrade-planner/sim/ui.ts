import type { SimState } from '../simulate';

export const selectClass = (changed: boolean) =>
	`rounded-xs border bg-surface-950 px-1.5 py-0.5 text-sm text-surface-100 focus:outline-none focus:border-accent-500 ${
		changed ? 'border-accent-500 bg-accent-500/10' : 'border-surface-700'
	}`;

export const linkButtonClass = 'text-surface-300 underline hover:text-surface-50';

export const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Simulator sections and the parts of the state each one owns. */
export const SECTIONS = {
	gear: ['gear'],
	accessories: ['accessories', 'accessoryStats'],
	bracelet: ['bracelet'],
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
