// The browser reports usage events here (see $lib/stats); they become daily counters in $lib/server/stats.
import { cleanEvent, recordBatch, statsEnabled } from '$lib/server/stats';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, url, fetch, getClientAddress }) => {
	if (request.headers.get('origin') !== url.origin) error(403, 'Forbidden');
	if (!statsEnabled()) return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
	const reader = request.body?.getReader();
	if (!reader) error(400, 'Event required');
	const chunks: Uint8Array[] = [];
	let bytes = 0;
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		bytes += value.byteLength;
		if (bytes > 8_192) { await reader.cancel(); error(413, 'Too large'); }
		chunks.push(value);
	}
	const text = Buffer.concat(chunks).toString('utf8');
	let body: unknown = null;
	try { body = JSON.parse(text); } catch { /* rejected below */ }
	const list = body && typeof body === 'object' && 'events' in body ? body.events : [body];
	if (!Array.isArray(list) || !list.length || list.length > 16) error(400, 'Invalid event batch');
	const events = list.map(cleanEvent);
	if (events.some(e => !e)) error(400, 'Unknown event');
	// Old single-event clients remain accepted. Retryable batches require an ID on every event.
	if (body && typeof body === 'object' && 'events' in body && events.some(e => !e?.id)) error(400, 'Event ID required');
	let status;
	try { status = await recordBatch(events as NonNullable<typeof events[number]>[], fetch, Date.now(), getClientAddress()); }
	catch { error(503, 'Stats storage is unavailable.'); }
	if (status === 'limited') return new Response(null, { status: 429, headers: { 'retry-after': '60', 'cache-control': 'no-store' } });
	return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
};
