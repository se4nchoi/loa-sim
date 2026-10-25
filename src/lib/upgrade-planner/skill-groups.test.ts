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

	it("reads the groups classes word their own way: Sorceress modes, Machinist Sync, Artist Paint", () => {
		expect(SKILL_GROUPS.elementalmaster[37330]).toContain('Casting Control'); // Explosion
		expect(SKILL_GROUPS.elementalmaster[37200]).toContain('Normal Mode'); // Blaze
		expect(SKILL_GROUPS.elementalmaster[37250]).toContain('Point Mode'); // Rime Arrow
		expect(SKILL_GROUPS.souleater[46430]).not.toContain('Normal Mode');
		expect(SKILL_GROUPS.scouter[35770]).toContain('Sync'); // Laser Blade
		expect(SKILL_GROUPS.yinyangshi[31060]).toContain('Paint'); // Paint: Shattering Strike
		for (const id of [24030, 24031, 24032]) expect(SKILL_GROUPS.forcemaster[id]).toContain('Supreme Art Form'); // Supreme Technique / Palm / Godfist
		const effects = Object.values(ORDER_CORE_EFFECTS).flat();
		expect(effects.some((e) => e.skills?.includes(47020))).toBe(true); // Breaker's "Asura War Basic Attack"
		expect(effects.some((e) => e.groups?.includes('Normal') && e.groups.includes('Encroachment'))).toBe(true); // Shadowhunter
	});

	it('core effects name groups beyond Souleater, multi-word ones included', () => {
		const named = new Set(Object.values(ORDER_CORE_EFFECTS).flat().flatMap((e) => e.groups ?? []));
		for (const g of ['Handgun', 'Gunlance', 'Phantom Beast', 'Holy Blade', 'Gravity Release', 'Holding']) expect(named).toContain(g);
	});
});
