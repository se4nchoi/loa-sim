import { describe, expect, it } from 'vitest';
import { PartType } from './cp';
import drkuuljulian from './fixtures/ce-drkuuljulian.json';
import yktra from './fixtures/ce-yktra.json';
import brushann from './fixtures/na-brushann.json';
import mira from './fixtures/na-mira.json';
import soulshan from './fixtures/na-soulshan.json';
import { formatPower, orbValue, parsePower, readParadise } from './paradise';
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
	it('an entered Paradise power rescores the orb', () => {
		const base = initSimState(l);
		expect(simulate(l, base, base).cp).toBeCloseTo(simulate(l, initSimState(l), base).cp, 12);
		const next = structuredClone(base);
		next.paradise!.power = 50e6;
		const v = orbPart(l).value!;
		const ratio = simulate(l, next, base).cp / simulate(l, base, base).cp;
		expect(ratio).toBeCloseTo((1 + orbValue(base.paradise!.k, 50e6) / 1e4) / (1 + v / 1e4), 12);
	});
});

it("a support's orb is flat: Paradise power changes nothing", () => {
	const l = brushann as unknown as Loadout;
	const base = initSimState(l);
	expect(base.paradise).toMatchObject({ orb: 657830002, flat: true });
	const next = structuredClone(base);
	next.paradise!.power += 5e6;
	expect(simulate(l, next, base).cp).toBe(simulate(l, base, base).cp);
});

it('reads typed Paradise power with commas or an M suffix', () => {
	expect(parsePower('30,014,791')).toBe(30014791);
	expect(parsePower(' 35000000 ')).toBe(35e6);
	expect(parsePower('35m')).toBe(35e6);
	expect(parsePower('31.5M')).toBe(31.5e6);
	expect(parsePower('0')).toBe(0);
	expect(parsePower('')).toBeNull();
	expect(parsePower('abc')).toBeNull();
	expect(parsePower('-5')).toBeNull();
	expect(formatPower(30014791)).toBe('30,014,791');
});
