import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: { GITHUB_ISSUES_REPO: 'se4nchoi/loa-sim' } }));
const { detail, reportStatus } = await import('./issues');

const issue = (over: Record<string, unknown> = {}) => ({
	number: 8, title: 'Duplicates', state: 'open' as const, labels: [], comments: 0,
	created_at: '2026-10-15T00:00:00Z', updated_at: '2026-10-18T00:00:00Z', user: { login: 'se4nchoi' }, ...over
});

describe('reports from GitHub issues', () => {
	it('maps state, close reason and assignees to a status', () => {
		expect(reportStatus({ state: 'open', assignees: [] })).toBe('open');
		expect(reportStatus({ state: 'open', assignees: [{ login: 'se4nchoi' }] })).toBe('in progress');
		expect(reportStatus({ state: 'closed', state_reason: 'completed' })).toBe('done');
		expect(reportStatus({ state: 'closed', state_reason: 'not_planned' })).toBe('closed');
	});
	it("shows a site report as a player's, without its contact or browser", () => {
		const body = 'please add dupes\n\n---\n**Type:** Feature request\n**Character:** NA/Soulshan\n**Contact:** me#1234\n**Page:** /\n**Browser:** Firefox\n\n_Sent from the loa-sim Report dialog._';
		const d = detail(issue({ body, labels: [{ name: 'from-site' }] }), [
			{ event: 'commented', actor: { login: 'se4nchoi' }, created_at: '2026-10-16T00:00:00Z', body_html: '<p>hey</p>' },
			{ event: 'labeled', actor: { login: 'se4nchoi' } },
			{ event: 'closed', actor: { login: 'se4nchoi' }, created_at: '2026-10-18T00:00:00Z', state_reason: 'completed' }
		]);
		expect(d).toMatchObject({ author: null, text: 'please add dupes', kind: 'Feature request', character: 'NA/Soulshan' });
		expect(JSON.stringify(d)).not.toMatch(/me#1234|Firefox/);
		expect(d.timeline.map((e) => [e.kind, e.by, e.dev])).toEqual([['comment', 'Soulshan', true], ['done', 'Soulshan', true]]);
	});
});
