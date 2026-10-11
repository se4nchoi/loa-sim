// A player's bug report or feature request, sent from the Updates card's Report dialog to /api/report, which files
// it as a GitHub issue (so players don't need a GitHub account). Shared by the dialog and the server.

export const REPORT_KINDS = [
	{ value: 'bug', label: 'Bug' },
	{ value: 'feature', label: 'Feature request' },
	{ value: 'data', label: 'Wrong numbers' }
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number]['value'];

export const REPORT_LIMITS = { title: 120, body: 4000, character: 60, contact: 100 } as const;

export interface ReportInput {
	kind: ReportKind;
	title: string;
	body: string;
	/** Optional: the character it happened on ("NA/Soulshan"). */
	character?: string;
	/** Optional: how to reach the reporter (Discord name, Reddit user, …). Public on the issue. */
	contact?: string;
	/** The page the report was sent from (path only). */
	page?: string;
	/** Spam trap: a field people never see. Anything in it means a bot. */
	website?: string;
}

/** Trims and checks a report; returns the clean report or a player-readable error. */
export function cleanReport(raw: unknown): { report: ReportInput } | { error: string } {
	const r = (raw ?? {}) as Record<string, unknown>;
	const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
	const kind = REPORT_KINDS.find((k) => k.value === r.kind)?.value;
	if (!kind) return { error: 'Pick what kind of report this is.' };
	const title = text(r.title, REPORT_LIMITS.title);
	const body = text(r.body, REPORT_LIMITS.body);
	if (title.length < 4) return { error: 'Give it a short title.' };
	if (body.length < 10) return { error: 'Describe it in a few words more.' };
	const page = text(r.page, 200);
	return {
		report: {
			kind,
			title,
			body,
			character: text(r.character, REPORT_LIMITS.character) || undefined,
			contact: text(r.contact, REPORT_LIMITS.contact) || undefined,
			page: page.startsWith('/') ? page : undefined,
			website: text(r.website, 200) || undefined
		}
	};
}
