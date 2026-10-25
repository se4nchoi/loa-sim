import { publicStats } from '$lib/server/public-stats';
import { MAX_STATS_DAYS, readStats } from '$lib/server/stats';
import type { StatsReport } from '$lib/stats-model';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const ranges: Record<string, number> = { '7': 7, '30': 30, '90': 90, all: MAX_STATS_DAYS };
const cache = new Map<string, { expires: number; report: StatsReport }>();
const pending = new Map<string, Promise<StatsReport>>();

export const GET: RequestHandler = async ({ url, fetch }) => {
	const range = url.searchParams.get('days') ?? '30';
	if (!Object.hasOwn(ranges, range)) error(400, 'Invalid date range');
	let report = cache.get(range);
	if (!report || report.expires <= Date.now()) {
		let task = pending.get(range);
		if (!task) {
			task = readStats(ranges[range], fetch).then(publicStats);
			pending.set(range, task);
		}
		try {
			const value = await task;
			report = { report: value, expires: Date.now() + 60_000 };
			cache.set(range, report);
		} catch { error(503, 'Stats are temporarily unavailable.'); }
		finally { pending.delete(range); }
	}
	return json(report.report, { headers: { 'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' } });
};
