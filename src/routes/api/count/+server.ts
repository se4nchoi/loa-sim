// The browser reports usage events here (see $lib/stats); they become daily counters in $lib/server/stats.
import { cleanEvent, count } from '$lib/server/stats';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, url, fetch }) => {
	if (request.headers.get('origin') !== url.origin) error(403, 'Forbidden');
	const text = await request.text();
	if (text.length > 512) error(413, 'Too large');
	let body: unknown = null;
	try { body = JSON.parse(text); } catch { /* rejected below */ }
	const event = cleanEvent(body);
	if (!event) error(400, 'Unknown event');
	await count(event, fetch);
	return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
};
