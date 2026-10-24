import { describe, expect, it } from 'vitest';
import type { RunSummary } from '$lib/logs/protocol';
import { wipeGap, wipeStory } from './dps-wipe';

const run = (extra: Partial<RunSummary>) => ({ cleared: false, damage: 250, ...extra }) as RunSummary;

describe('wipe gap', () => {
	it('turns the boss HP left into the damage the party, or this player alone, needed', () => {
		// Boss at 10% of 1000 HP: the party dealt 900, needed 100 more (+11.1%); this player did 25% of it (225).
		const g = wipeGap(run({ bossHp: { left: 100, max: 1000 }, partyDamage: 1000 }))!;
		expect(g.hpLeftPct).toBeCloseTo(10);
		expect(g.partyPct).toBeCloseTo(100 / 900 * 100);
		expect(g.sharePct).toBeCloseTo(25);
		expect(g.youPct).toBeCloseTo(100 / 225 * 100);
	});

	it('has nothing for clears, unknown HP or a boss left at full', () => {
		expect(wipeGap(run({ cleared: true, bossHp: { left: 0, max: 1000 } }))).toBeNull();
		expect(wipeGap(run({}))).toBeNull();
		expect(wipeGap(run({ bossHp: { left: 1000, max: 1000 } }))).toBeNull();
		expect(wipeGap(run({ bossHp: { left: 100, max: 1000 } }))!.youPct).toBeNull();
	});
});

describe('wipe story', () => {
	let id = 0;
	const pull = (sec: number, hpPct: number, extra: Partial<RunSummary> = {}) =>
		run({ id: ++id, duration: sec * 1000, bossHp: { left: hpPct * 10, max: 1000 }, partyDamage: 1000, ...extra });
	it('calls repeated endings at one boss HP a mechanic, not damage', () => {
		const gate = [pull(600, 54), pull(640, 53), pull(590, 55)];
		const s = wipeStory(gate[0], gate)!;
		expect(s.pattern).toEqual({ kind: 'hp', count: 3, at: 54 });
	});
	it('calls repeated endings at one time, boss at different HP, a timer: a DPS check', () => {
		const gate = [pull(1200, 8), pull(1203, 15), pull(1198, 30)];
		expect(wipeStory(gate[0], gate)!.pattern?.kind).toBe('time');
	});

});

describe('enrage, ruled out', () => {
	let id = 100;
	const pull = (sec: number, hpPct: number) => ({ cleared: false, damage: 250, id: ++id, duration: sec * 1000, bossHp: { left: hpPct * 10, max: 1000 }, partyDamage: 1000 }) as RunSummary;
	it('is no timer when a clear of the gate lasted longer, or the boss HP barely differs', () => {
		const gate = [pull(311, 77), pull(311, 71), pull(316, 88)];
		expect(wipeStory(gate[0], gate)!.pattern?.kind).toBe('time');
		expect(wipeStory(gate[0], gate, 1277)!.pattern?.kind).not.toBe('time');
		const close = [pull(311, 77), pull(311, 71), pull(316, 78)];
		expect(wipeStory(close[0], close)!.pattern?.kind).not.toBe('time');
	});
});
