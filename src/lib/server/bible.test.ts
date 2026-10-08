import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
const { loadCharacter, serverFetchEnabled } = await import('./bible');

// A minimal SvelteKit __data.json body: one page node with an ark passive loadout.
const body = (score: number) => ({
	type: 'data',
	nodes: [{ type: 'data', data: [{ loadouts: 1 }, [2], { type: 3, battlePoint: 4, combatPower: 5 }, 'ark_passive', { parts: 6, isSupport: 7 }, { id: 8, score: 9 }, [], false, 1, score] }]
});

describe('server character loader', () => {
	it('is on unless turned off', () => {
		expect(serverFetchEnabled()).toBe(true);
	});

	it('shares one request between simultaneous loads and caches the result', async () => {
		const fetchFn = vi.fn(async () => new Response(JSON.stringify(body(4000))));
		const [a, b] = await Promise.all([loadCharacter('NA', 'Same', fetchFn as never), loadCharacter('NA', 'same', fetchFn as never)]);
		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(a.loadout?.combatPower?.score).toBe(4000);
		expect(b).toBe(a);
		await loadCharacter('NA', 'Same', fetchFn as never);
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it('explains failures and does not cache them', async () => {
		const notFound = vi.fn(async () => new Response('nope', { status: 404 }));
		await expect(loadCharacter('NA', 'Ghost', notFound as never)).rejects.toThrow("Ghost (NA) wasn't found on lostark.bible");
		const garbage = vi.fn(async () => new Response('<html>'));
		await expect(loadCharacter('NA', 'Garbage', garbage as never)).rejects.toThrow('lostark.bible sent something unexpected');
		const ok = vi.fn(async () => new Response(JSON.stringify(body(1))));
		await expect(loadCharacter('NA', 'Garbage', ok as never)).resolves.toBeTruthy();
	});
});
