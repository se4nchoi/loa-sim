import { describe, expect, it } from 'vitest';
import { applyUpgrade } from './apply-upgrade';
import { PartType } from './cp';
import drkuuljulian from './fixtures/ce-drkuuljulian.json';
import yktra from './fixtures/ce-yktra.json';
import brushann from './fixtures/na-brushann.json';
import mira from './fixtures/na-mira.json';
import soulshan from './fixtures/na-soulshan.json';
import { liveUpgrades } from './live-upgrades';
import { orbValue, readParadise } from './paradise';
import { initSimState, simulate } from './simulate';
import type { Loadout } from './types';

const orbPart = (l: Loadout) => l.battlePoint.parts.find((p) => p.type === PartType.ParadiseOrb)!;

describe.each([['Soulshan', soulshan], ['Mira', mira], ['Yktra', yktra], ['Drkuuljulian', drkuuljulian]])('Paradise orb: %s', (_, fixture) => {
	const l = fixture as unknown as Loadout;
	it("k × (power / 1M + 2.5) reproduces bible's value", () => {
		const p = readParadise(l)!;
		expect(p.flat).toBe(false);
		expect(orbValue(p.k, p.power)).toBeCloseTo(orbPart(l).value!, 6);
	});
	it('+1M Paradise power adds k battle points to the orb', () => {
		const base = initSimState(l);
		const next = structuredClone(base);
		next.paradise!.power += 1e6;
		const v = orbPart(l).value!;
		const ratio = simulate(l, next, base).cp / simulate(l, base, base).cp;
		expect(ratio).toBeCloseTo((1 + (v + base.paradise!.k) / 1e4) / (1 + v / 1e4), 12);
	});
	it('Next Upgrades offers the next million and Apply matches it', () => {
		const base = initSimState(l);
		const row = liveUpgrades(l, base, base).find((u) => u.category === 'paradise')!;
		const next = structuredClone(base);
		expect(applyUpgrade(l, next, base, row)).toBe(true);
		expect(next.paradise!.power % 1e6).toBe(0);
		expect((simulate(l, next, base).cp / simulate(l, base, base).cp - 1) * 100).toBeCloseTo(row.gainPct, 9);
	});
});

it("a dealer swapping to the Spreading Mist uses that orb's k", () => {
	const l = drkuuljulian as unknown as Loadout;
	const base = initSimState(l);
	const next = structuredClone(base);
	next.paradise!.orb = 657830001;
	const v = orbPart(l).value!;
	const ratio = simulate(l, next, base).cp / simulate(l, base, base).cp;
	expect(ratio).toBeCloseTo((1 + orbValue(12, base.paradise!.power) / 1e4) / (1 + v / 1e4), 12);
});

it("a support's orb is flat: nothing to simulate or suggest", () => {
	const l = brushann as unknown as Loadout;
	const base = initSimState(l);
	expect(base.paradise).toMatchObject({ orb: 657830002, flat: true });
	const next = structuredClone(base);
	next.paradise!.power += 5e6;
	expect(simulate(l, next, base).cp).toBe(simulate(l, base, base).cp);
	expect(liveUpgrades(l, base, base).some((u) => u.category === 'paradise')).toBe(false);
});
