import { describe, expect, it } from 'vitest';
import soulshan from './fixtures/na-soulshan.json';
import type { Loadout } from './types';
import { gemItemId, gemParts, gemsInEffect, initSimState, MAX_GEMS, simulate } from './simulate';
import { budgetChanges } from './sim-budget';
import { gemDpsGainPct } from './dps';

const loadout = soulshan as unknown as Loadout;

describe('gems added in empty slots', () => {
	const base = initSimState(loadout);

	it('names regular gem item ids', () => {
		expect(gemItemId('T4', 'damage', 10)).toBe(65031100);
		expect(gemItemId('T4', 'cooldown', 7)).toBe(65032070);
		expect(gemItemId('T3', 'damage', 1)).toBe(65021010);
	});

	it('score like the same gem in the snapshot', () => {
		// A 10-gem snapshot: Soulshan without the last gem. Adding that gem back must give the 11-gem CP.
		const parts = gemParts(loadout);
		const last = parts[parts.length - 1];
		const ten = structuredClone(loadout);
		ten.battlePoint.parts.splice(loadout.battlePoint.parts.lastIndexOf(last.part), 1);
		ten.gems = (ten.gems ?? []).slice(0, -1);
		expect(gemParts(ten).length).toBe(parts.length - 1);
		const tenBase = initSimState(ten);
		const missing = base.gems[parts.length - 1];
		const restored = structuredClone(tenBase);
		restored.gems.push({ ...missing, tier: missing.tier ?? last.tier ?? 'T4' });
		const tenCp = simulate(ten, tenBase, tenBase).cp;
		expect(simulate(ten, restored, tenBase).cp).toBeGreaterThan(tenCp);
		// (bible's base-attack figure still holds the removed gem here, so compare level steps, not totals:
		// a level on the added gem moves CP exactly like a level on the same gem in the snapshot.)
		const k = parts.length - 1;
		const lower = structuredClone(restored);
		lower.gems[lower.gems.length - 1].level = missing.level - 1;
		const fullLower = structuredClone(base);
		fullLower.gems[k].level = missing.level - 1;
		const step = simulate(ten, restored, tenBase).cp - simulate(ten, lower, tenBase).cp;
		expect(step).toBeGreaterThan(0);
		const snapshotStep = simulate(loadout, base, base).cp - simulate(loadout, fullLower, base).cp;
		expect(Math.abs(step / snapshotStep - 1)).toBeLessThan(0.02); // totals differ slightly (see above)
		const removedAgain = structuredClone(restored);
		removedAgain.gems.pop();
		expect(simulate(ten, removedAgain, tenBase).cp).toBeCloseTo(simulate(ten, tenBase, tenBase).cp, 6);
		expect(MAX_GEMS).toBe(11);
	});

	it('show in the budget and the DPS estimate', () => {
		const added = structuredClone(base);
		const skill = base.gems[0].skill!;
		added.gems.push({ tier: 'T4', level: 10, kind: base.gems[0].kind === 'damage' ? 'cooldown' : 'damage', skill });
		expect(budgetChanges(loadout, base, added).some(c => c.title.startsWith('New T4'))).toBe(true);
		const dps = gemDpsGainPct(base.gems, added.gems, gemParts(loadout), { [skill]: 30 }, { [skill]: 100 });
		expect(dps).toBeGreaterThan(0);
	});
});

describe('one gem of each kind per skill', () => {
	const base = initSimState(loadout);
	it('keeps the highest and deactivates the rest', () => {
		const g = (level: number, kind: 'damage' | 'cooldown', skill: number | null) => ({ level, kind, skill });
		expect(gemsInEffect([g(9, 'damage', 1), g(10, 'damage', 1), g(10, 'cooldown', 1), g(8, 'damage', null), g(8, 'damage', null)])).toEqual([false, true, true, true, true]);
		expect(gemsInEffect([g(10, 'damage', 1), g(10, 'damage', 1)])).toEqual([true, false]);
	});
	it('drops a deactivated gem from CP and DPS; clearing a skill keeps its CP', () => {
		const i = base.gems.findIndex(g => g.kind === 'damage' && g.skill !== null);
		const j = base.gems.findIndex((g, k) => k !== i && g.kind === 'damage' && g.skill !== null && g.skill !== base.gems[i].skill && g.level <= base.gems[i].level);
		const dup = structuredClone(base);
		dup.gems[j].skill = dup.gems[i].skill;
		const cleared = structuredClone(base);
		cleared.gems[j].skill = null;
		const cp = (s: typeof base) => simulate(loadout, s, base).cp;
		expect(cp(dup)).toBeLessThan(cp(base));
		expect(cp(cleared)).toBeCloseTo(cp(base), 6);
		const shares = { [base.gems[i].skill!]: 40, [base.gems[j].skill!]: 20 };
		const dpsDup = gemDpsGainPct(base.gems, dup.gems, gemParts(loadout), shares, {})!;
		const dpsCleared = gemDpsGainPct(base.gems, cleared.gems, gemParts(loadout), shares, {})!;
		expect(dpsDup).toBeCloseTo(dpsCleared, 10);
		expect(dpsDup).toBeLessThan(0);
	});
});
