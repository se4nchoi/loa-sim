import { error } from '@sveltejs/kit';
import { listReports } from '$lib/server/issues';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
	try {
		const reports = await listReports(fetch);
		setHeaders({ 'cache-control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=600' });
		return { reports };
	} catch (e) {
		error(502, `Couldn't load reports (${e instanceof Error ? e.message : 'unknown error'}). Please try again in a bit.`);
	}
};
