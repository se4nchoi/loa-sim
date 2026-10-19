import { error, json } from '@sveltejs/kit';
import { marketPrices } from '$lib/server/market-prices';
import { marketPricesEnabled } from '$lib/market-flag';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, fetch }) => {
	if (!marketPricesEnabled()) error(404, 'Market prices are turned off.');
	const region = url.searchParams.get('region');
	if (region !== 'nae' && region !== 'euc') error(400, 'Choose NA East or EU Central.');
	try {
		return json(await marketPrices(region, fetch), {
			headers: { 'Cache-Control': 'public, max-age=60, s-maxage=600, stale-while-revalidate=600' }
		});
	} catch {
		return json({ message: 'Market prices are unavailable. Your saved prices have not changed.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
	}
};
