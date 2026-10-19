// One clear's gear snapshot from lostark.bible as JSON (LOA Logs stores its hash with each clear). Browsers can't fetch
// bible's data directly. A snapshot never changes, so browsers and the CDN keep it.
import { isSnapshotHash } from '$lib/bible-data';
import { loadSnapshot, serverFetchEnabled } from '$lib/server/bible';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, fetch, setHeaders }) => {
	const hash = `${params.version}/${params.hash}`.toLowerCase();
	if (!isSnapshotHash(hash)) error(404, 'Unknown snapshot');
	if (!serverFetchEnabled()) error(503, 'Loading from lostark.bible is turned off.');
	try {
		const snapshot = await loadSnapshot(hash, fetch);
		setHeaders({ 'cache-control': 'public, max-age=86400, s-maxage=31536000, immutable' });
		return json(snapshot);
	} catch (e) {
		error(502, e instanceof Error ? e.message : 'Could not load the snapshot');
	}
};
