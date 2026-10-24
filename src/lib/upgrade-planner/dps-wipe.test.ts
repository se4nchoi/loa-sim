import { describe, expect, it } from 'vitest';
import type { RunSummary } from '$lib/logs/protocol';
import { wipeGap } from './dps-wipe';

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
