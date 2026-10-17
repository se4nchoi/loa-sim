import {beforeEach,describe,expect,it,vi} from 'vitest';

const service = vi.hoisted(() => ({
	redisConfig:vi.fn(() => ({url:'https://redis.example',token:'secret'})),
	sharedPlan:vi.fn(() => ({id:'test'})),
	allowShare:vi.fn(async () => true),
	createSharedSimulation:vi.fn(async () => ({path:'/s/Soulshan/abcdefgh',expiresAt:1234}))
}));
vi.mock('$lib/server/shared-simulations', () => ({...service,MAX_SHARE_BYTES:512}));
const {POST} = await import('../../routes/api/share/+server');
async function request(body = '{}', origin: string | null = 'https://loa-sim.example') {
	const headers: Record<string,string> = {'content-type':'application/json'};
	if (origin) headers.origin=origin;
	return await POST({request:new Request('https://loa-sim.example/api/share',{method:'POST',headers,body}),url:new URL('https://loa-sim.example/api/share'),fetch,getClientAddress:()=>'127.0.0.1'} as never) as Response;
}
beforeEach(() => {vi.clearAllMocks();service.allowShare.mockResolvedValue(true);});
describe('share endpoint', () => {
	it('creates a short internal path from validated snapshot input',async () => {
		const response=await request(); expect(response.status).toBe(201);expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.json()).toEqual({path:'/s/Soulshan/abcdefgh',expiresAt:1234});
		expect(service.sharedPlan).toHaveBeenCalledWith('{}');
	});
	it('rejects cross-origin or missing-origin submissions before touching storage',async () => {
		await expect(request('{}','https://another.example')).rejects.toMatchObject({status:403});
		await expect(request('{}',null)).rejects.toMatchObject({status:403});
		expect(service.allowShare).not.toHaveBeenCalled();
	});
	it('bounds a body without Content-Length and rejects it before storage',async () => {
		await expect(request('x'.repeat(513))).rejects.toMatchObject({status:413});
		expect(service.sharedPlan).not.toHaveBeenCalled();expect(service.createSharedSimulation).not.toHaveBeenCalled();
	});
	it('does not create a link when the distributed rate limit is exceeded',async () => {
		service.allowShare.mockResolvedValue(false);
		await expect(request()).rejects.toMatchObject({status:429}); expect(service.createSharedSimulation).not.toHaveBeenCalled();
	});
});
