export function chartGeometry(values: number[]) {
	const safe = values.map(n => Number.isFinite(n) ? Math.max(0, n) : 0);
	const ceiling = Math.max(1, ...safe);
	const points = safe.map((value, i) => ({x: safe.length < 2 ? 500 : 12 + i / (safe.length - 1) * 976, y: 176 - value / ceiling * 150}));
	const line = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
	const area = points.length ? `${line} L${points.at(-1)!.x.toFixed(2)},188 L${points[0].x.toFixed(2)},188 Z` : '';
	return {ceiling, points, line, area};
}

