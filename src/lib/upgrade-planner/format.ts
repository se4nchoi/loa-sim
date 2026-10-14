export const formatPct = (pct: number, digits = 2) => `${pct >= 0 ? '+' : ''}${pct.toFixed(digits)}`;

export const formatCp = (cp: number) => cp.toFixed(2);
/** Same in every language: 10-12-26 (month-day-year). */
export const formatDate = (at: number) => {
	const d = new Date(at);
	return [d.getMonth() + 1, d.getDate(), d.getFullYear() % 100].map(n => String(n).padStart(2, '0')).join('-');
};
