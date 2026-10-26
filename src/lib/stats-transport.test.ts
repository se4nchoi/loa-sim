import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStatsQueue } from './stats-transport';
import { statsBreakdown } from './stats-model';
import { resolveClass } from './upgrade-planner/class-names';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('stats delivery', () => {
	it('batches actions and retries the same IDs after a transient failure', async () => {
		const send = vi.fn().mockResolvedValueOnce(new Response(null, {status: 503})).mockResolvedValue(new Response(null, {status: 204}));
		const queue = createStatsQueue(send);
		queue.enqueue({ event: 'budget_opened' });
		queue.enqueue({ event: 'build_saved' });
		await vi.advanceTimersByTimeAsync(500);
		expect(send).toHaveBeenCalledTimes(1);
		const first = send.mock.calls[0][1].body;
		expect(JSON.parse(first).events).toHaveLength(2);
		expect(JSON.parse(first).events.every((event:{v:number})=>event.v===3)).toBe(true);
		await vi.advanceTimersByTimeAsync(2_000);
		expect(send).toHaveBeenCalledTimes(2);
		expect(send.mock.calls[1][1].body).toBe(first);
	});

	it('drops permanent failures and bounds queued traffic', async () => {
		const send = vi.fn().mockResolvedValue(new Response(null, {status: 400}));
		const queue = createStatsQueue(send);
		for (let i = 0; i < 100; i++) queue.enqueue({event: 'budget_opened'});
		await vi.runAllTimersAsync();
		expect(send).toHaveBeenCalledTimes(4);
		expect(send.mock.calls.flatMap(([, init]) => JSON.parse(init.body).events)).toHaveLength(64);
	});

	it('stops retrying a broken endpoint and does not throw when ID generation fails', async () => {
		const send = vi.fn().mockRejectedValue(new Error('offline'));
		const queue = createStatsQueue(send);
		queue.enqueue({event: 'budget_opened'});
		await vi.runAllTimersAsync();
		expect(send).toHaveBeenCalledTimes(3);
		expect(() => createStatsQueue(send, () => { throw new Error('disabled'); }).enqueue({event: 'build_saved'})).not.toThrow();
	});
	it('splits larger UTF-8 payloads below the ingestion byte limit without losing events',async()=>{
		const send=vi.fn().mockResolvedValue(new Response(null,{status:204}));
		const queue=createStatsQueue(send);
		for(let i=0;i<16;i++)queue.enqueue({event:'lookup',region:'NA',name:'가'.repeat(1000)});
		await vi.runAllTimersAsync();
		expect(send.mock.calls.length).toBeGreaterThan(1);
		expect(send.mock.calls.every(([,init])=>new TextEncoder().encode(init.body).byteLength<=8192)).toBe(true);
		expect(send.mock.calls.flatMap(([,init])=>JSON.parse(init.body).events)).toHaveLength(16);
	});
});

describe('stats labels', () => {
	it.each(['dragon_knight', 'Guardianknight', 'dragonknight'])('canonicalizes %s', name => {
		expect(resolveClass(name)).toBe('dragonknight');
	});
	it('retains and combines legacy unknown counts without changing unrelated classes', () => {
		expect(statsBreakdown({'class:Other': 5, 'class:Unknown': 2, 'class:Bard': 10}, 'class:')).toEqual([['Bard', 10], ['Unknown class', 7]]);
	});
});
