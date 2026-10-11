import { describe, expect, it } from 'vitest';
import { cpBreakdown } from './cp-breakdown';
import { PartType } from './cp';
import soulshan from './fixtures/na-soulshan.json';
import brushann from './fixtures/na-brushann.json';
import type { Loadout } from './types';

const dealer = soulshan as unknown as Loadout;
const support = brushann as unknown as Loadout;
const sum = (b: ReturnType<typeof cpBreakdown>) =>
	b.sides.reduce((s, side) => s + side.base.cp + side.rows.reduce((r, row) => r + row.cp, 0), 0);

describe('cp breakdown', () => {
	it('dealer: base plus section shares add up to the in-game score', () => {
		const b = cpBreakdown(dealer.battlePoint.parts, false, dealer.combatPower!.score);
		expect(b.sides).toHaveLength(1);
		expect(sum(b)).toBeCloseTo(dealer.combatPower!.score, 6);
		expect(b.anchor).toBeGreaterThan(0.95);
		expect(b.anchor).toBeLessThan(1.05);
		const engravings = b.sides[0].rows.find((r) => r.group === 'engravings')!;
		expect(engravings.items.map((i) => i.label)).toContain('Grudge');
		expect(b.sides[0].rows.every((r) => r.change === 0)).toBe(true);
	});

	it('support: Buff Power and Shield & Heal Power add up to the score', () => {
		const b = cpBreakdown(support.battlePoint.parts, true, support.combatPower!.score);
		expect(b.sides.map((s) => s.label)).toEqual(['Buff Power', 'Shield & Heal Power']);
		expect(sum(b)).toBeCloseTo(support.combatPower!.score, 6);
		expect(b.sides[0].total + b.sides[1].total).toBeCloseTo(support.combatPower!.score, 6);
	});

	it("reports a section's change and what one more point of it is worth", () => {
		const parts = dealer.battlePoint.parts;
		const after = parts.map((p) => (p.type === PartType.CardSet ? { ...p, value: (p.value ?? 0) + 500 } : p));
		const b = cpBreakdown(after, false, 7000, parts);
		const cards = b.sides[0].rows.find((r) => r.group === 'cards')!;
		const before = parts.find((p) => p.type === PartType.CardSet)!.value!;
		expect(cards.change).toBeCloseTo(((1e4 + before + 500) / (1e4 + before) - 1) * 100, 9);
		expect(cards.next).toBeCloseTo((7000 * 0.01 * 1e4) / (1e4 + before + 500), 6);
		expect(b.sides[0].rows.filter((r) => r.group !== 'cards').every((r) => Math.abs(r.change) < 1e-9)).toBe(true);
	});
});
