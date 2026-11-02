import { error } from '@sveltejs/kit';
import { DEV_NAME, getReport, NotFound } from '$lib/server/issues';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, fetch, setHeaders }) => {
	const n = Number(params.number);
	if (!Number.isInteger(n) || n < 1) error(404, 'No such report');
	try {
		const report = await getReport(n, fetch);
		setHeaders({ 'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600' });
		return { report, dev: DEV_NAME };
	} catch (e) {
		if (e instanceof NotFound) error(404, 'No such report');
		error(502, `Couldn't load this report (${e instanceof Error ? e.message : 'unknown error'}). Please try again in a bit.`);
	}
};
