import { describe, expect, it, vi } from 'vitest';
import snapshot from '$lib/upgrade-planner/fixtures/mathi-soulshan-v3.json';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
const { loadCharacter, loadSnapshot, serverFetchEnabled } = await import('./bible');

// A minimal SvelteKit __data.json body: one page node with an ark passive loadout.
const body = (score: number) => ({
	type: 'data',
	nodes: [{ type: 'data', data: [{ loadouts: 1 }, [2], { type: 3, battlePoint: 4, combatPower: 5 }, 'ark_passive', { parts: 6, isSupport: 7 }, { id: 8, score: 9 }, [], false, 1, score] }]
});

describe('server clear snapshot loader', () => {
	it('uses Mathi\'s endpoint, coalesces callers and caches the normalized snapshot', async () => {
		const hash = `v3/${'a'.repeat(64)}`;
		const fetchFn = vi.fn(async () => new Response(JSON.stringify(snapshot)));
		const [a, b] = await Promise.all([loadSnapshot(hash, fetchFn), loadSnapshot(hash, fetchFn)]);
		expect(a).toBe(b);
		expect(a.combatPower?.score).toBe(6620.18);
		expect(a.items?.[0]).toMatchObject({ slot: 'weapon', data: { honing: 24, advancedHoning: 40 } });
		await loadSnapshot(hash, fetchFn);
		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(fetchFn).toHaveBeenCalledWith(`https://loadout.mathi.moe/v3/loadouts/by-hash/${'a'.repeat(64)}`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
	});
	it('does not cache missing snapshots, invalid JSON or changed schemas', async () => {
		for (const [index, response] of [new Response('', { status: 404 }), new Response('<html>'), new Response('{}')].entries()) {
			const hash = `v3/${String(index).repeat(64)}`;
			const fetchFn = vi.fn().mockResolvedValueOnce(response).mockResolvedValueOnce(new Response(JSON.stringify(snapshot)));
			await expect(loadSnapshot(hash, fetchFn)).rejects.toThrow();
			await expect(loadSnapshot(hash, fetchFn)).resolves.toMatchObject({ combatPower: { score: 6620.18 } });
			expect(fetchFn).toHaveBeenCalledTimes(2);
		}
	});
});

describe('server character loader', () => {
	it('fetches raw snapshots from Mathi, deduplicates requests, and retries failures', async () => {
		const raw = snapshot;
		const fetchFn = vi.fn(async (_url: unknown) => new Response(JSON.stringify(raw)));
		const hash = `v3/${'c'.repeat(64)}`;
		const [a, b] = await Promise.all([loadSnapshot(hash, fetchFn as never), loadSnapshot(hash, fetchFn as never)]);
		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(fetchFn.mock.calls[0][0]).toBe(`https://loadout.mathi.moe/v3/loadouts/by-hash/${'c'.repeat(64)}`);
		expect(a.classId).toBe('souleater'); expect(b).toBe(a);
		const missing = `v3/${'b'.repeat(64)}`;
		await expect(loadSnapshot(missing, vi.fn(async () => new Response('', {status: 404})) as never)).rejects.toThrow('snapshot');
		await expect(loadSnapshot(missing, fetchFn as never)).resolves.toHaveProperty('classId', 'souleater');
	});
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
	it('fetches a newer snapshot after a minute instead of extending the cache on repeated loads', async () => {
		vi.useFakeTimers();
		try {
			const fetchFn = vi.fn()
				.mockImplementationOnce(async () => new Response(JSON.stringify(body(4000))))
				.mockImplementationOnce(async () => new Response(JSON.stringify(body(4100))));
			await loadCharacter('NA', 'Updated', fetchFn as never);
			vi.advanceTimersByTime(59_000);
			expect((await loadCharacter('NA', 'Updated', fetchFn as never)).loadout?.combatPower?.score).toBe(4000);
			expect(fetchFn).toHaveBeenCalledTimes(1);
			vi.advanceTimersByTime(1_000);
			expect((await loadCharacter('NA', 'Updated', fetchFn as never)).loadout?.combatPower?.score).toBe(4100);
			expect(fetchFn).toHaveBeenCalledTimes(2);
		} finally { vi.useRealTimers(); }
	});
});
