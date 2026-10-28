import { describe, expect, it } from 'vitest';
import { replayStacks, replayWindow, STACK_RULES, type ReplaySkillLog } from './stack-replay';

const rule = (core: string) => STACK_RULES.find((r) => r.core === core)!;
const WINDOW = 9001;
const names = new Map([[WINDOW, 'Destiny: Demon Fire']]);
const hit = (t: number, damage = 0, buffs = [WINDOW]) => ({ timestamp: t, damage, buffedBy: buffs });
/** Flamethrower casts with `n` hits each, at these times. */
const flamer = (...casts: [t: number, n: number][]): ReplaySkillLog =>
	({ id: 1, name: 'Flamethrower', casts: casts.map(([t, n]) => ({ timestamp: t, hits: Array.from({ length: n }, (_, i) => hit(t + i * 10)) })) });
const napalm = (...ts: number[]): ReplaySkillLog => ({ id: 2, name: 'Napalm Shot', casts: ts.map((t) => ({ timestamp: t, hits: [hit(t + 5, 100)] })) });

describe('stack replay', () => {
	it('counts each spending cast at the stacks built since the last one, capped', () => {
		const out = replayStacks(rule('Demon Fire'), [flamer([0, 12], [1000, 70]), napalm(500, 2000, 3000)], names)!;
		// 12 hits, then 70 hits capped at 50, then nothing left after the second Napalm Shot.
		expect(out[2]).toEqual({ '12': 100, '50': 100, '0': 100 });
	});
	it('gains only inside the Destiny window', () => {
		const outside = { id: 1, name: 'Flamethrower', casts: [{ timestamp: 0, hits: [hit(0, 0, []), hit(10, 0, [WINDOW])] }] };
		expect(replayStacks(rule('Demon Fire'), [outside, napalm(500)], names)![2]).toEqual({ '1': 100 });
	});
	it("is unknown when the run doesn't have the window buff or never gained a stack", () => {
		expect(replayStacks(rule('Demon Fire'), [flamer([0, 5]), napalm(500)], new Map())).toBeNull();
		expect(replayStacks(rule('Demon Fire'), [napalm(500)], names)).toBeNull();
	});
	it('expires stacks after their duration, and keeps unconsumed ones across casts', () => {
		const rend: ReplaySkillLog = { id: 23440, name: 'Earth Rend', casts: [20_000, 40_000].map((t) => ({ timestamp: t, hits: [hit(t + 5, 100, [7])] })) };
		const stamina: ReplaySkillLog = { id: 23020, name: 'Stamina', casts: [0, 1000, 2000, 3000, 30_000].map((t) => ({ timestamp: t, hits: [hit(t + 5, 1, [7])] })) };
		const r = { ...rule('Earth Collapse'), from: { skills: ['Stamina'] } };
		// 15s after the last gain (3s) the stacks are gone by 20s; one gain at 30s is still up at 40s.
		expect(replayStacks(r, [stamina, rend], new Map([[7, 'Destiny: Condensed Stamina']]))![23440]).toEqual({ '0': 100, '1': 100 });
	});
	it('counts a chance as expected stacks', () => {
		const silverhawk: ReplaySkillLog = { id: 1, name: 'Silverhawk Basic Attack', casts: [{ timestamp: 0, hits: [hit(0), hit(10), hit(20)] }] };
		const shot: ReplaySkillLog = { id: 2, name: 'Charged Shot', casts: [{ timestamp: 100, hits: [hit(105, 100)] }] };
		expect(replayStacks(rule('TA-64 Reaper Bolt'), [silverhawk, shot], new Map([[WINDOW, 'Destiny: Compounding Draw']]))![2]).toEqual({ '1.5': 100 });
	});
});

describe('buff window replay', () => {
	it("splits each skill's damage by hits under the window buff", () => {
		const s: ReplaySkillLog = { id: 5, name: 'Swoop', casts: [{ timestamp: 0, hits: [hit(0, 30, [7]), hit(10, 70, [])] }] };
		expect(replayWindow(['Destiny: Nightmare'], [s], new Map([[7, 'Destiny: Nightmare']]))).toEqual({ 5: { '1': 30, '0': 70 } });
		expect(replayWindow(['Destiny: Nightmare'], [s], new Map())).toBeNull();
	});
});
