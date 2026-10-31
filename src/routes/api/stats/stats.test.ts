import {beforeEach,describe,expect,it,vi} from 'vitest';
const env=vi.hoisted(()=>({STATS_KEY:'owner-test-key'}));
vi.mock('$env/dynamic/private',()=>({env}));
vi.mock('$lib/server/stats-postgres',()=>({statsConfigured:()=>true}));
vi.mock('$lib/server/stats',()=>({MAX_STATS_DAYS:3660,readStats:vi.fn()}));
const {readStats}=await import('$lib/server/stats');
const {GET}=await import('./+server');
const read=vi.mocked(readStats);
const request=(key?:string,days='30')=>({request:new Request('http://localhost/api/stats',{headers:key?{authorization:`Bearer ${key}`}:{}}),url:new URL(`http://localhost/api/stats?days=${days}`),fetch}) as Parameters<typeof GET>[0];
beforeEach(()=>{read.mockReset();env.STATS_KEY='owner-test-key';});

describe('private dashboard access',()=>{
	it('never reads aggregates for missing, wrong or disabled keys',async()=>{
		await expect(GET(request())).rejects.toMatchObject({status:404});
		await expect(GET(request('incorrect'))).rejects.toMatchObject({status:404});
		env.STATS_KEY='';
		await expect(GET(request('owner-test-key'))).rejects.toMatchObject({status:404});
		expect(read).not.toHaveBeenCalled();
	});
	it('returns actual recorded counters only to the owner with private no-store caching',async()=>{
		read.mockResolvedValue({from:'2026-10-25',to:'2026-10-26',distinctCharacters:2,totals:{budget_sampled:3,'budget:coverage:complete':2},days:[]});
		const response=await GET(request('owner-test-key'));
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(response.headers.get('x-robots-tag')).toBe('noindex');
		expect((await response.json()).totals).toEqual({budget_sampled:3,'budget:coverage:complete':2});
		expect(read).toHaveBeenCalledWith(30,fetch);
	});
	it('rejects excessive authenticated report ranges before storage reads',async()=>{
		await expect(GET(request('owner-test-key','999999'))).rejects.toMatchObject({status:400});
		expect(read).not.toHaveBeenCalled();
	});
});
