// Players' reports as the Reports page shows them (read from GitHub issues by $lib/server/issues).

export type ReportStatus = 'open' | 'in progress' | 'done' | 'closed';

export interface ReportSummary {
	number: number;
	title: string;
	status: ReportStatus;
	/** A REPORT_KINDS label ("Bug", "Feature request", "Wrong numbers"), when known. */
	kind: string | null;
	comments: number;
	created: string;
	updated: string;
}

export type ReportEvent =
	| { kind: 'comment'; by: string; dev: boolean; at: string; html: string }
	| { kind: 'assigned' | 'done' | 'closed' | 'reopened'; by: string; dev: boolean; at: string };

export interface ReportDetail extends ReportSummary {
	/** Null for a report sent from the site (a player's). */
	author: string | null;
	/** A site report's words, as plain text. */
	text?: string;
	/** Anything else: GitHub's rendered (sanitized) HTML. */
	html?: string;
	character?: string;
	timeline: ReportEvent[];
}

export const STATUS_TONE: Record<ReportStatus, string> = {
	open: 'border-surface-500 text-surface-300',
	'in progress': 'border-accent-500/60 text-accent-200',
	done: 'border-green-500/50 text-green-300',
	closed: 'border-surface-600 text-surface-500'
};

/** YYYY-MM-DD… → MM-DD-YY, as on the Updates card. */
export const day = (d: string) => `${d.slice(5, 7)}-${d.slice(8, 10)}-${d.slice(2, 4)}`;
