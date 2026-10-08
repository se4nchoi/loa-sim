import { REGIONS, type Region } from './bible-data';

const KEY = 'loa-sim:region';
const valid = (value: string | null): value is Region => REGIONS.includes(value as Region);

export function preferredRegion(explicit?: string | null): Region {
	const region = explicit?.toUpperCase() ?? null;
	if (valid(region)) return region;
	try {
		const saved = localStorage.getItem(KEY);
		if (valid(saved)) return saved;
	} catch { /* Storage may be blocked. */ }
	return 'NA';
}

export function saveRegion(region: string) {
	if (!valid(region)) return;
	try { localStorage.setItem(KEY, region); } catch { /* Loading still works without storage. */ }
}
