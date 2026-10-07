export const formatPct = (pct: number, digits = 2) => `${pct >= 0 ? '+' : ''}${pct.toFixed(digits)}`;

export const formatCp = (cp: number) => cp.toFixed(2);
