import { describe, expect, it, vi } from 'vitest';
import { cleanReport } from '$lib/report';

const env: Record<string, string> = { GITHUB_ISSUES_TOKEN: 'test-token' };
vi.mock('$env/dynamic/private', () => ({ env }));
const { allowReport, fileIssue, issueBody, reportingEnabled } = await import('./report');

const report = { kind: 'bug' as const, title: 'Gems card overflows', body: 'On my phone the gem card runs off the screen.' };

describe('report dialog server', () => {
	it('cleans input and rejects thin reports', () => {
		expect(cleanReport({ ...report, title: '  Gems card overflows  ', page: 'https://evil.example' })).toEqual({
			report: { ...report, character: undefined, contact: undefined, page: undefined, website: undefined }
		});
		expect(cleanReport({ ...report, kind: 'spam' })).toEqual({ error: 'Pick what kind of report this is.' });
		expect(cleanReport({ ...report, body: 'bad' })).toHaveProperty('error');
		expect(cleanReport(null)).toHaveProperty('error');
	});

	it('limits each address to three reports per window', () => {
		const t = 1_000_000;
		expect([1, 2, 3, 4].map((i) => allowReport('1.2.3.4', t + i))).toEqual([true, true, true, false]);
		expect(allowReport('5.6.7.8', t)).toBe(true);
		expect(allowReport('1.2.3.4', t + 11 * 60 * 1000)).toBe(true);
	});

	it('files the issue with labels, and again without them if GitHub rejects the labels', async () => {
		expect(reportingEnabled()).toBe(true);
		const calls: { labels: string[]; body: string }[] = [];
		const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
			const sent = JSON.parse(init.body as string);
			calls.push(sent);
			if (sent.labels.length) return new Response('{}', { status: 422 });
			return new Response(JSON.stringify({ html_url: 'https://github.com/se4nchoi/loa-sim/issues/7' }), { status: 201 });
		});
		const url = await fileIssue({ ...report, character: 'NA/Soulshan', page: '/sim' }, 'TestBrowser', fetchFn as never);
		expect(url).toBe('https://github.com/se4nchoi/loa-sim/issues/7');
		expect(calls.map((c) => c.labels)).toEqual([['bug', 'from-site'], []]);
		expect(calls[1].body).toContain('**Character:** NA/Soulshan');
		expect(fetchFn.mock.calls[0][0]).toBe('https://api.github.com/repos/se4nchoi/loa-sim/issues');
	});

	it('puts the player’s words first', () => {
		expect(issueBody(report).startsWith(report.body)).toBe(true);
	});
});
