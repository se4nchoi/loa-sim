// The Report dialog posts here; the report becomes a GitHub issue (see $lib/server/report).
import { cleanReport } from '$lib/report';
import { allowReportShared, fileIssue, reportingEnabled } from '$lib/server/report';
import { forgetReports } from '$lib/server/issues';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, url, fetch, getClientAddress }) => {
	if (request.headers.get('origin') !== url.origin) error(403, 'Please send reports from loa-sim.');
	if (!reportingEnabled()) error(503, 'Reporting from the site is off right now. Please use GitHub instead.');
	const cleaned = cleanReport(await request.json().catch(() => null));
	if ('error' in cleaned) error(400, cleaned.error);
	const { report } = cleaned;
	// Bots fill the hidden field: pretend it worked.
	if (report.website) return json({ ok: true });
	if (!(await allowReportShared(getClientAddress()))) error(429, 'Thanks! That’s a few reports already; please try again in a few minutes.');
	try {
		const url = await fileIssue(report, request.headers.get('user-agent') ?? '', fetch);
		forgetReports();
		// The site's own Reports page for it, when GitHub gave the issue's number.
		const n = /\/issues\/(\d+)$/.exec(url)?.[1];
		return json({ ok: true, url: n ? `/reports/${n}` : '/reports' });
	} catch (e) {
		error(502, `Couldn't send the report (${e instanceof Error ? e.message : 'unknown error'}). Please try again or use GitHub.`);
	}
};
