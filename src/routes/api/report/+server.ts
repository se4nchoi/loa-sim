// The Report dialog posts here; the report becomes a GitHub issue (see $lib/server/report).
import { cleanReport } from '$lib/report';
import { allowReport, fileIssue, reportingEnabled } from '$lib/server/report';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, fetch, getClientAddress }) => {
	if (!reportingEnabled()) error(503, 'Reporting from the site is off right now. Please use GitHub instead.');
	const cleaned = cleanReport(await request.json().catch(() => null));
	if ('error' in cleaned) error(400, cleaned.error);
	const { report } = cleaned;
	// Bots fill the hidden field: pretend it worked.
	if (report.website) return json({ ok: true });
	if (!allowReport(getClientAddress())) error(429, 'Thanks! That’s a few reports already; please try again in a few minutes.');
	try {
		const url = await fileIssue(report, request.headers.get('user-agent') ?? '', fetch);
		return json({ ok: true, url });
	} catch (e) {
		error(502, `Couldn't send the report (${e instanceof Error ? e.message : 'unknown error'}). Please try again or use GitHub.`);
	}
};
