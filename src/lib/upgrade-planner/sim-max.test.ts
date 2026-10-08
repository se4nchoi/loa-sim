import { describe, expect, it } from 'vitest';
import dealer from './fixtures/na-soulshan.json';
import support from './fixtures/na-brushann.json';
import { BRACELET_EFFECTS, ASTROGEM_ITEMS, ASTROGEM_KINDS, ITEMS } from './game-data';
import { SUPPORT_BRACELET_EFFECTS } from './support-data';
import { astrogemWillpower } from './arkgrid-optimize';
import { honingUpgrades } from './honing-upgrades';
import { BRACELET_MAX_STATS, maxArkGridCore, maxBracelet, maxEquipment, maxScore } from './sim-max';
import { initSimState, simulate, type SimState } from './simulate';
import { coreStates } from './upgrades';
import type { Loadout } from './types';

const loadout = dealer as unknown as Loadout;
const scoring = (l: Loadout, state: SimState, base = initSimState(l)) => (edit: (s: SimState) => void) => {
	const s = structuredClone(state);
	edit(s);
	return simulate(l, s, base).cp;
};

describe('Serca prerequisites', () => {
	it('imports Advanced Honing 40 even when the snapshot omits it', () => {
		const l = structuredClone(loadout);
		for (const item of l.items ?? []) if (Math.floor(item.id / 1000) === 134621) delete item.data.advancedHoning;
		const s = initSimState(l);
		expect(Object.values(s.gear).every((g) => g.advanced === 40)).toBe(true);
		expect(honingUpgrades(l, s).some((u) => u.key.startsWith('advanced:'))).toBe(false);
	});
	it('cannot simulate lowering Serca advanced honing', () => {
		const s = initSimState(loadout);
		const before = simulate(loadout, s).cp;
		s.gear.head!.advanced = 0;
		s.gear.weapon!.advanced = 0;
		expect(simulate(loadout, s).cp).toBe(before);
	});
});

describe('Max equipment', () => {
	it('maxes regular equipment, Sidereal and the bracer without editing other sections', () => {
		const s = initSimState(loadout);
		s.gear.head!.set = 'aegir';
		s.sidereal = { infusion: 1, evolution: 6, advanced: 20 };
		const accessories = structuredClone(s.accessories);
		maxEquipment(s);
		expect(Object.values(s.gear).every((g) => g.honing === 25 && g.advanced === 40)).toBe(true);
		expect(s.gear.head!.set).toBe('aegir');
		expect(s.bracer).toEqual({ grade: 'ancient', honing: 25 });
		expect(s.sidereal).toEqual({ infusion: 3, evolution: 10, advanced: 40 });
		expect(s.accessories).toEqual(accessories);
	});
});

describe('Max Ark Grid', () => {
	it.each([loadout, support as unknown as Loadout])('maxes four gems per core within Ancient Willpower capacity', (l) => {
		const s = initSimState(l);
		const before = simulate(l, s).cp;
		for (const core of coreStates(l)) maxArkGridCore(l, s, core, scoring(l, s));
		for (const c of s.arkGrid) {
			expect(c.grade).toBe('ancient');
			expect(c.gems).toHaveLength(4);
			expect(c.gems.reduce((sum, g) => sum + astrogemWillpower(g), 0)).toBeLessThanOrEqual(17);
			for (const g of c.gems) {
				expect(g.removed).toBeFalsy();
				expect(ITEMS[g.itemId][2]).toBe(6);
				expect(g.corePoints).toBe(5);
				expect(g.costReduc).toBe(5);
				expect(g.opts).toHaveLength(2);
				expect(g.opts.every((o) => o.level === 5 && ASTROGEM_KINDS[ASTROGEM_ITEMS[g.itemId]].options.includes(o.id))).toBe(true);
			}
		}
		expect(simulate(l, s).cp).toBeGreaterThan(before);
		const gems = s.arkGrid[0].gems;
		for (let i = 0; i < gems.length; i++) for (let j = i + 1; j < gems.length; j++) {
			expect(gems[i]).not.toBe(gems[j]);
			expect(gems[i].opts).not.toBe(gems[j].opts);
		}
	});

	it('maxes one removed gem without changing the core or other gems', () => {
		const s = initSimState(loadout);
		const core = coreStates(loadout)[0];
		const ci = s.arkGrid.findIndex((c) => c.id === core.id);
		s.arkGrid[ci].gems.forEach((g) => { g.costReduc = 5; });
		s.arkGrid[ci].gems[0].removed = true;
		const before = structuredClone(s.arkGrid[ci]);
		maxArkGridCore(loadout, s, core, scoring(loadout, s), 0);
		expect(s.arkGrid[ci].gems[0].removed).toBeFalsy();
		expect(s.arkGrid[ci].gems[0].corePoints).toBe(5);
		expect(s.arkGrid[ci].gems.slice(1)).toEqual(before.gems.slice(1));
		expect(s.arkGrid[ci].grade).toEqual(before.grade);
	});

	it('supports reactive gem proxies without cloning them', () => {
		const s = initSimState(loadout);
		const core = coreStates(loadout)[0];
		const ci = s.arkGrid.findIndex((c) => c.id === core.id);
		const score = maxScore(loadout, s, initSimState(loadout));
		s.arkGrid[ci].gems = s.arkGrid[ci].gems.map((g) => new Proxy(g, {}));
		maxArkGridCore(loadout, s, core, score);
		expect(s.arkGrid[ci].gems.every((g) => g.corePoints === 5)).toBe(true);
	});
});

describe('Max bracelet', () => {
	it.each([loadout, support as unknown as Loadout])('chooses two max stats and three distinct high effects by CP', (l) => {
		const s = initSimState(l);
		const score = maxScore(l, s, initSimState(l));
		const result = maxBracelet(l, score)!;
		expect(result.lines).toHaveLength(5);
		for (const line of result.lines.slice(0, 2)) expect(BRACELET_MAX_STATS).toContainEqual(line);
		expect(result.lines[0]).not.toEqual(result.lines[1]);
		const catalog = l.battlePoint.isSupport ? SUPPORT_BRACELET_EFFECTS : BRACELET_EFFECTS;
		const family = (line: typeof result.lines[number]) => line.kind === 'effect'
			? catalog.find((e) => e.key === line.key)!.family : line.kind === 'stat' ? `${line.type ?? 2}:${line.index}` : 'empty';
		expect(new Set(result.lines.slice(2).map(family)).size).toBe(3);
		for (const line of result.lines.slice(2)) if (line.kind === 'effect')
			expect(catalog.some((e) => e.key === line.key && e.t4 && e.grade === 0)).toBe(true);
		const best = score((s) => { s.bracelet = result; });
		expect(best).toBeGreaterThan(simulate(l, s).cp);
		// Check even the dominated stat pairs against the chosen effect combination.
		for (let a = 0; a < BRACELET_MAX_STATS.length; a++) for (let b = a + 1; b < BRACELET_MAX_STATS.length; b++) {
			const cp = score((s) => { s.bracelet = { lines: [BRACELET_MAX_STATS[a], BRACELET_MAX_STATS[b], ...result.lines.slice(2)] }; });
			expect(cp).toBeLessThanOrEqual(best + 1e-9);
		}
	}, 20000);
});
