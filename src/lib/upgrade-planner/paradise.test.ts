import { describe, expect, it } from 'vitest';
import { PartType } from './cp';
import drkuuljulian from './fixtures/ce-drkuuljulian.json';
import yktra from './fixtures/ce-yktra.json';
import brushann from './fixtures/na-brushann.json';
import mira from './fixtures/na-mira.json';
import soulshan from './fixtures/na-soulshan.json';
import { PARADISE_ORBS } from './game-data';
import { formatPower, orbChoices, orbName, orbPower, orbSeason, orbValue, parsePower, readParadise } from './paradise';
import { initSimState, simulate } from './simulate';
import type { Loadout } from './types';

const orbPart = (l: Loadout) => l.battlePoint.parts.find((p) => p.type === PartType.ParadiseOrb)!;

describe.each([['Soulshan', soulshan], ['Mira', mira], ['Yktra', yktra], ['Drkuuljulian', drkuuljulian]])('Paradise orb: %s', (_, fixture) => {
	const l = fixture as unknown as Loadout;
	it("k × (power / 1M + 2.5) reproduces bible's value", () => {
		const p = readParadise(l)!;
		expect(p.flat).toBe(false);
		expect(orbValue(p.k, orbPower(p))).toBeCloseTo(orbPart(l).value!, 6);
	});
	it("the game table's k (perPower / 100) matches bible's read-back value", () => {
		const p = readParadise(l)!;
		expect(PARADISE_ORBS[p.orb].perPower / 100).toBeCloseTo(p.k, 6);
		expect(PARADISE_ORBS[p.orb].base).toBeCloseTo(p.k * 2.5, 6);
	});
	it('an entered Paradise power rescores the orb', () => {
		const base = initSimState(l);
		expect(simulate(l, base, base).cp).toBeCloseTo(simulate(l, initSimState(l), base).cp, 12);
		const next = structuredClone(base);
		next.paradise!.powers[orbSeason(next.paradise!.orb)!] = 50e6;
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
	next.paradise!.powers[4] += 5e6;
	expect(simulate(l, next, base).cp).toBe(simulate(l, base, base).cp);
});

it("switching orbs scores the new orb at its own season's power", () => {
	const l = soulshan as unknown as Loadout; // Season 3 Rhythmic Tide at 31.56M
	const base = initSimState(l);
	const v = orbPart(l).value!;
	const next = structuredClone(base);
	next.paradise!.orb = 657830001; // Season 4 Spreading Mist, k = 12
	// No Season 4 power entered yet: it starts at the snapshot's (Season 3) power.
	const at = (cpNext: number) => cpNext / simulate(l, base, base).cp;
	expect(at(simulate(l, next, base).cp)).toBeCloseTo((1 + orbValue(12, 31558736) / 1e4) / (1 + v / 1e4), 12);
	next.paradise!.powers[4] = 30e6;
	expect(at(simulate(l, next, base).cp)).toBeCloseTo((1 + orbValue(12, 30e6) / 1e4) / (1 + v / 1e4), 12);
	// The Season 3 power is kept for switching back.
	next.paradise!.orb = base.paradise!.orb;
	expect(simulate(l, next, base).cp).toBeCloseTo(simulate(l, base, base).cp, 9);
});

it('names known orbs, and any other orb by the season in its id', () => {
	expect(orbName(657820001)).toBe('Rhythmic Tide Orb');
	expect(orbName(657830002)).toBe('Orb of the Blazing Sun');
	expect(orbSeason(657800001)).toBe(1);
	expect(orbSeason(657830003)).toBe(4);
	expect(orbName(657830003)).toBe('Season 4 orb');
	expect(orbName(657800001)).toBe('Orb of the Sacred Nature');
	expect(orbChoices(readParadise(soulshan as unknown as Loadout)!)).toHaveLength(10);
	expect(orbName(123)).toBe('Orb of Paradise');
});

it('reads typed Paradise power with commas or an M suffix', () => {
	expect(parsePower('30,014,791')).toBe(30014791);
	expect(parsePower(' 35000000 ')).toBe(35e6);
	expect(parsePower('35m')).toBe(35e6);
	expect(parsePower('31.5M')).toBe(31.5e6);
	expect(parsePower('40 m')).toBe(40e6);
	expect(parsePower('35000k')).toBe(35e6);
	expect(parsePower('0')).toBe(0);
	expect(parsePower('')).toBeNull();
	expect(parsePower('abc')).toBeNull();
	expect(parsePower('-5')).toBeNull();
	expect(formatPower(30014791)).toBe('30,014,791');
});
