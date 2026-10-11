// Files a player's report as a GitHub issue with the site's own token, so players don't need a GitHub account.
// Set GITHUB_ISSUES_TOKEN (a fine-grained token with Issues: read and write on the repo) and optionally
// GITHUB_ISSUES_REPO (default se4nchoi/loa-sim). Without a token, reporting is off and players are pointed to
// GitHub directly. Each address can send a few reports per window (per server instance: a speed bump, not a wall).

import { env } from '$env/dynamic/private';
import { REPORT_KINDS, type ReportInput } from '$lib/report';

const WINDOW_MS = 10 * 60 * 1000;
const PER_WINDOW = 3;
const sent = new Map<string, number[]>();

export const reportingEnabled = () => !!env.GITHUB_ISSUES_TOKEN;
const repo = () => env.GITHUB_ISSUES_REPO || 'se4nchoi/loa-sim';

/** True if `who` may send another report now (and counts it). */
export function allowReport(who: string, now = Date.now()): boolean {
	const recent = (sent.get(who) ?? []).filter((t) => now - t < WINDOW_MS);
	if (recent.length >= PER_WINDOW) {
		sent.set(who, recent);
		return false;
	}
	recent.push(now);
	sent.set(who, recent);
	return true;
}

const LABELS: Record<ReportInput['kind'], string> = { bug: 'bug', feature: 'enhancement', data: 'bug' };

/** The issue text: the player's words, then what they added, marked as sent from the site. */
export function issueBody(r: ReportInput, userAgent = ''): string {
	const kind = REPORT_KINDS.find((k) => k.value === r.kind)?.label ?? r.kind;
	const facts = [
		`**Type:** ${kind}`,
		r.character && `**Character:** ${r.character}`,
		r.contact && `**Contact:** ${r.contact}`,
		r.page && `**Page:** ${r.page}`,
		userAgent && `**Browser:** ${userAgent.slice(0, 200)}`
	].filter(Boolean);
	return `${r.body}\n\n---\n${facts.join('\n')}\n\n_Sent from the loa-sim Report dialog._`;
}

/** Creates the issue; returns its URL. Throws a player-readable message on failure. */
export async function fileIssue(r: ReportInput, userAgent: string, fetchFn: typeof fetch): Promise<string> {
	const create = (labels: string[]) =>
		fetchFn(`https://api.github.com/repos/${repo()}/issues`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${env.GITHUB_ISSUES_TOKEN}`,
				accept: 'application/vnd.github+json',
				'x-github-api-version': '2022-11-28',
				'user-agent': 'loa-sim report dialog'
			},
			body: JSON.stringify({ title: r.title, body: issueBody(r, userAgent), labels }),
			signal: AbortSignal.timeout(15_000)
		});
	let res = await create([LABELS[r.kind], 'from-site']);
	// A token that can't set labels (or a label GitHub rejects) still gets the report through.
	if (res.status === 422) res = await create([]);
	if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
	const issue = (await res.json()) as { html_url?: string };
	return issue.html_url ?? `https://github.com/${repo()}/issues`;
}
