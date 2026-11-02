// The repo's issues, read from GitHub for the site's Reports page, so players can follow a report (replies, who's on
// it, when it's done) without visiting GitHub. Uses GITHUB_ISSUES_TOKEN when set (read access is enough), else
// GitHub's anonymous limit. Cached per server instance; the pages also set a CDN cache header.
//
// Reports sent from the site are filed with the site's token, so GitHub shows the developer as their author: those
// show as a player's, with only the player's own words and the character they gave (no contact or browser).

import { env } from '$env/dynamic/private';
import { REPORT_KINDS } from '$lib/report';
import type { ReportDetail, ReportEvent, ReportStatus, ReportSummary } from '$lib/reports';

const TTL_MS = 60 * 1000;
const SITE_MARK = '_Sent from the loa-sim Report dialog._';
/** The repo owner's name on the site. */
export const DEV_NAME = 'Soulshan';

const repo = () => env.GITHUB_ISSUES_REPO || 'se4nchoi/loa-sim';
const owner = () => repo().split('/')[0];

interface GhUser { login: string }
interface GhIssue {
	number: number;
	title: string;
	state: 'open' | 'closed';
	state_reason?: string | null;
	labels: { name: string }[];
	assignees?: GhUser[];
	comments: number;
	created_at: string;
	updated_at: string;
	closed_at?: string | null;
	user: GhUser;
	body?: string | null;
	body_html?: string | null;
	pull_request?: unknown;
}
interface GhEvent {
	event: string;
	actor?: GhUser;
	user?: GhUser;
	created_at?: string;
	body_html?: string;
	state_reason?: string | null;
}

const cache = new Map<string, { at: number; value: unknown }>();
/** Drops the cached list (a report was just filed). */
export const forgetReports = () => cache.delete('list');

async function cached<T>(key: string, load: () => Promise<T>, now = Date.now()): Promise<T> {
	const hit = cache.get(key);
	if (hit && now - hit.at < TTL_MS) return hit.value as T;
	try {
		const value = await load();
		cache.set(key, { at: now, value });
		return value;
	} catch (e) {
		// GitHub down or rate-limited: an older copy beats an error page.
		if (hit) return hit.value as T;
		throw e;
	}
}

async function gh<T>(path: string, fetchFn: typeof fetch): Promise<T> {
	const res = await fetchFn(`https://api.github.com/repos/${repo()}${path}`, {
		headers: {
			...(env.GITHUB_ISSUES_TOKEN ? { authorization: `Bearer ${env.GITHUB_ISSUES_TOKEN}` } : {}),
			accept: 'application/vnd.github.full+json',
			'x-github-api-version': '2022-11-28',
			'user-agent': 'loa-sim reports'
		},
		signal: AbortSignal.timeout(15_000)
	});
	if (res.status === 404) throw new NotFound();
	if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
	return (await res.json()) as T;
}
export class NotFound extends Error {}

export function reportStatus(i: Pick<GhIssue, 'state' | 'state_reason' | 'assignees'>): ReportStatus {
	if (i.state === 'closed') return i.state_reason === 'not_planned' ? 'closed' : 'done';
	return i.assignees?.length ? 'in progress' : 'open';
}

const fromSite = (i: GhIssue) => !!i.body?.includes(SITE_MARK) || i.labels.some((l) => l.name === 'from-site');
/** "**Type:** Bug" lines from a site report's footer. */
function siteFacts(body: string): Record<string, string> {
	const facts: Record<string, string> = {};
	for (const m of body.matchAll(/^\*\*(\w+):\*\* (.+)$/gm)) facts[m[1].toLowerCase()] = m[2].trim();
	return facts;
}
function kindOf(i: GhIssue): string | null {
	const typed = i.body && fromSite(i) ? siteFacts(i.body).type : undefined;
	if (typed && REPORT_KINDS.some((k) => k.label === typed)) return typed;
	if (i.labels.some((l) => l.name === 'bug')) return 'Bug';
	if (i.labels.some((l) => l.name === 'enhancement')) return 'Feature request';
	return null;
}
const who = (u: GhUser | undefined) => (!u ? 'GitHub' : u.login === owner() ? DEV_NAME : u.login);

export function summarize(i: GhIssue): ReportSummary {
	return {
		number: i.number,
		title: i.title,
		status: reportStatus(i),
		kind: kindOf(i),
		comments: i.comments,
		created: i.created_at,
		updated: i.updated_at
	};
}

export function detail(i: GhIssue, events: GhEvent[]): ReportDetail {
	const site = fromSite(i);
	const body = i.body ?? '';
	const facts = site ? siteFacts(body) : {};
	const timeline: ReportEvent[] = [];
	for (const e of events) {
		const at = e.created_at ?? '';
		const by = who(e.actor ?? e.user);
		const dev = (e.actor ?? e.user)?.login === owner();
		if (e.event === 'commented') timeline.push({ kind: 'comment', by, dev, at, html: e.body_html ?? '' });
		else if (e.event === 'assigned') timeline.push({ kind: 'assigned', by, dev, at });
		else if (e.event === 'closed') timeline.push({ kind: e.state_reason === 'not_planned' ? 'closed' : 'done', by, dev, at });
		else if (e.event === 'reopened') timeline.push({ kind: 'reopened', by, dev, at });
	}
	return {
		...summarize(i),
		author: site ? null : who(i.user),
		// A site report's own words come before its "---" footer; shown as plain text.
		text: site ? body.split('\n\n---\n')[0].trim() : undefined,
		html: site ? undefined : (i.body_html ?? ''),
		character: facts.character,
		timeline
	};
}

/** Open and closed issues (not pull requests), most recently updated first. */
export const listReports = (fetchFn: typeof fetch) =>
	cached('list', async () => {
		const issues = await gh<GhIssue[]>('/issues?state=all&sort=updated&per_page=100', fetchFn);
		return issues.filter((i) => !i.pull_request).map(summarize);
	});

export const getReport = (n: number, fetchFn: typeof fetch) =>
	cached(`#${n}`, async () => {
		const [issue, events] = await Promise.all([gh<GhIssue>(`/issues/${n}`, fetchFn), gh<GhEvent[]>(`/issues/${n}/timeline?per_page=100`, fetchFn)]);
		if (issue.pull_request) throw new NotFound();
		return detail(issue, events);
	});
