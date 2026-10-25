import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('$env/dynamic/private', () => ({env: {}}));
vi.mock('$lib/server/stats', async importOriginal => ({
	...await importOriginal<typeof import('$lib/server/stats')>(), recordBatch: vi.fn()
}));
const { recordBatch } = await import('$lib/server/stats');
const { POST } = await import('./+server');
const persist = vi.mocked(recordBatch);

function request(body: string, origin = 'http://localhost') {
	return { request: new Request('http://localhost/api/count', { method: 'POST', headers: { origin }, body }),
		url: new URL('http://localhost/api/count'), fetch, getClientAddress: () => 'local-test' } as Parameters<typeof POST>[0];
}
beforeEach(() => { persist.mockReset(); persist.mockResolvedValue('accepted'); });

describe('stats ingestion boundary', () => {
	it('rejects cross-origin and oversized payloads before persistence', async () => {
		await expect(POST(request('{}', 'https://elsewhere.example'))).rejects.toMatchObject({status: 403});
		await expect(POST(request('x'.repeat(8_193)))).rejects.toMatchObject({status: 413});
		expect(persist).not.toHaveBeenCalled();
	});

	it('validates an entire batch and requires IDs before any writes', async () => {
		await expect(POST(request(JSON.stringify({events: [{event: 'sim_open'}]})))).rejects.toMatchObject({status: 400});
		await expect(POST(request(JSON.stringify({events: [{event: 'sim_open', id: crypto.randomUUID()}, {event: 'share_created'}]})))).rejects.toMatchObject({status: 400});
		expect(persist).not.toHaveBeenCalled();
	});

	it('accepts legacy clients and valid retryable batches', async () => {
		expect((await POST(request(JSON.stringify({event: 'sim_open'})))).status).toBe(204);
		const events = [{event: 'budget_opened', id: crypto.randomUUID()}];
		expect((await POST(request(JSON.stringify({events})))).status).toBe(204);
		expect(persist.mock.calls[1][0]).toEqual(events);
	});

	it('signals a retryable outage or rate limit instead of false success', async () => {
		persist.mockRejectedValueOnce(new Error('offline'));
		await expect(POST(request(JSON.stringify({event: 'sim_open'})))).rejects.toMatchObject({status: 503});
		persist.mockResolvedValueOnce('limited');
		const response = await POST(request(JSON.stringify({event: 'sim_open'})));
		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBe('60');
	});
});
