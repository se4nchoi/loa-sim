import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('$lib/server/stats', () => ({MAX_STATS_DAYS:3660,readStats:vi.fn()}));
const { readStats } = await import('$lib/server/stats');
const { GET } = await import('./+server');
const read = vi.mocked(readStats);

function request(range: string) {
	return {url:new URL(`http://localhost/api/stats/public?days=${range}`),fetch} as Parameters<typeof GET>[0];
}
beforeEach(() => read.mockReset());

describe('anonymous stats endpoint', () => {
	it('loads without a key, strips private fields, and caches repeated reads', async () => {
		read.mockResolvedValue({from:'2026-10-20',to:'2026-10-25',distinctCharacters:5,
			totals:{sim_open:12,lookup_fail:3},days:[]});
		const response = await GET(request('30'));
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toContain('s-maxage=300');
		expect((await response.json()).totals).toEqual({sim_open:12});
		await GET(request('30'));
		expect(read).toHaveBeenCalledTimes(1);
	});
	it.each(['0','-1','123456','NaN','__proto__'])('rejects unsupported ranges: %s', async range => {
		await expect(GET(request(range))).rejects.toMatchObject({status:400});
		expect(read).not.toHaveBeenCalled();
	});
	it('shares concurrent cache misses instead of issuing duplicate storage reads', async () => {
		let finish!: (value: Awaited<ReturnType<typeof readStats>>) => void;
		read.mockReturnValue(new Promise(resolve => { finish = resolve; }));
		const first = GET(request('7')), second = GET(request('7'));
		finish({from:'2026-10-20',to:'2026-10-25',distinctCharacters:0,totals:{},days:[]});
		await Promise.all([first, second]);
		expect(read).toHaveBeenCalledTimes(1);
	});
	it('returns an unavailable state without caching an invented empty report', async () => {
		read.mockRejectedValueOnce(new Error('offline'));
		await expect(GET(request('90'))).rejects.toMatchObject({status:503});
		read.mockResolvedValueOnce({from:'2026-10-20',to:'2026-10-25',distinctCharacters:1,totals:{},days:[]});
		expect((await GET(request('90'))).status).toBe(200);
	});
});
