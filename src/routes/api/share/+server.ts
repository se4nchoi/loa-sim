import { error, json } from '@sveltejs/kit';
import { allowShare, createSharedSimulation, MAX_SHARE_BYTES, sharingConfigured, sharedPlan } from '$lib/server/shared-simulations';
import { count } from '$lib/server/stats';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({request,url,fetch,getClientAddress}) => {
	if (request.headers.get('origin') !== url.origin) error(403, 'Please share from loa-sim.');
	if (!sharingConfigured()) error(503, 'Simulation sharing is not configured yet.');
	// Bound streamed bodies too; Content-Length alone can be missing or untrusted.
	const reader = request.body?.getReader();
	if (!reader) error(400, 'A simulation is required.');
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (true) {
		const {done,value} = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > MAX_SHARE_BYTES) { await reader.cancel(); error(413, 'This simulation is too large to share.'); }
		chunks.push(value);
	}
	let plan;
	try { plan = sharedPlan(Buffer.concat(chunks).toString('utf8')); }
	catch (e) { error(400, e instanceof Error ? e.message : 'Invalid simulation.'); }
	let allowed;
	try { allowed = await allowShare(getClientAddress(), fetch); }
	catch { error(503, 'Sharing is temporarily unavailable. Please try again later.'); }
	if (!allowed) error(429, 'You have shared several builds. Please try again in 10 minutes.');
	let created;
	try { created = await createSharedSimulation(plan, fetch); }
	catch { error(503, 'Could not save the shared build. Please try again later.'); }
	await count({event:'share_created'}, fetch);
	return json(created, {status:201,headers:{'cache-control':'no-store'}});
};
