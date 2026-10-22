import { describe, expect, it } from 'vitest';
import { ORDER_CORE_EFFECTS } from './order-cores';
import { SKILL_GROUPS } from './skill-groups';

describe('skill groups for every class', () => {
	it('puts skills in their class group and their kind', () => {
		expect(SKILL_GROUPS.souleater[46430]).toEqual(['Stygian']); // Astaros
		expect(SKILL_GROUPS.berserker[16070]).toEqual(['Normal', 'Holding']); // Whirlwind
		expect(SKILL_GROUPS.devilhunter[29020]).toContain('Handgun'); // Enforce Execution
		expect(SKILL_GROUPS.warlord[17210]).toContain('Charge'); // Charged Stinger
	});

	it('core effects name groups beyond Souleater, multi-word ones included', () => {
		const named = new Set(Object.values(ORDER_CORE_EFFECTS).flat().flatMap((e) => e.groups ?? []));
		for (const g of ['Handgun', 'Gunlance', 'Phantom Beast', 'Holy Blade', 'Gravity Release', 'Holding']) expect(named).toContain(g);
	});
});
