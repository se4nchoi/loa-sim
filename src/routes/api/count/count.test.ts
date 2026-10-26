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
	it('accepts a mixed cached-v2 and current-v3 batch without relabeling its models',async()=>{
		const {CP_STATS_MODEL}=await import('$lib/stats-versions');
		const cohort={start:'1760to1789',region:'NA',classId:'souleater',role:'dealer',model:'cp-2026-10-25'};
		const legacy={event:'opportunity_sampled',v:2,id:crypto.randomUUID(),insight:{kind:'opportunity',cohort,best:'gem',coverage:'partial',assumption:'standard',offers:[{band:'100k',category:'gem',gain:'under1'}]}};
		const current={event:'upgrade_applied',v:3,id:crypto.randomUUID(),category:'gem',sampling:{kind:'decision',model:CP_STATS_MODEL,reason:'baseline-mismatch'}};
		const events=[legacy,current];
		expect((await POST(request(JSON.stringify({events})))).status).toBe(204);
		expect(persist.mock.calls[0][0]).toEqual(events);
		persist.mockClear();
		const unknown={...legacy,insight:{...legacy.insight,cohort:{...cohort,model:'unknown'}}};
		await expect(POST(request(JSON.stringify({events:[current,unknown]})))).rejects.toMatchObject({status:400});
		expect(persist).not.toHaveBeenCalled();
	});
});
