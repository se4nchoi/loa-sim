export const formatPct = (pct: number, digits = 2) => `${pct >= 0 ? '+' : ''}${pct.toFixed(digits)}`;

export const formatCp = (cp: number) => cp.toFixed(2);

const GOLD_KEY = 'upgrade-planner:gold';

/** User-entered gold costs, keyed by upgrade key. Per browser only; never required. */
export function loadGold(): Record<string, number> {
	try {
		return JSON.parse(localStorage.getItem(GOLD_KEY) ?? '{}');
	} catch {
		return {};
	}
}

export function saveGold(gold: Record<string, number>) {
	try {
		localStorage.setItem(GOLD_KEY, JSON.stringify(gold));
	} catch {
		// storage unavailable (private mode): costs just won't persist
	}
}
