import { describe, expect, it } from 'vitest';
import { assumedDamage, stackCap } from '../../../scripts/order-core-assumptions.mjs';
import { ORDER_CORE_EFFECTS } from './order-cores';

describe('explicit Order core assumptions', () => {
	it.each([
		['(Max 5 stacks)', 5], ['Max 3 stacks.', 3], ['(Up to 6 stacks)', 6],
		['stackable up to 10 times, once per 0.5s.', 10], ['the max stack count increases to 6', 6],
		['Gain 1 stack.', null], ['Max 3 stacks. Max 5 stacks.', null]
	])('reads the cap in %s', (text, expected) => {
		expect(stackCap(text as string)).toBe(expected);
	});
	it('multiplies a per-stack bonus but not a threshold bonus', () => {
		expect(assumedDamage('Overdrive Damage +20.0% per stack.', 'Up to 3 stacks.')).toMatchObject({
			line: 'Overdrive Damage +20.0%', assumed: 'max-stacks', stacks: 3, scale: 3
		});
		expect(assumedDamage('At max stacks, Timeline Collapse Damage +20.0%.', '(Max 8 stacks)')).toMatchObject({
			line: 'Timeline Collapse Damage +20.0%', assumed: 'max-stacks', stacks: 8, scale: 1
		});
	});
	it('targets a consumed stack bonus at its consuming skill', () => {
		expect(assumedDamage('Damage +4.0% per stack.', 'Max 50 stacks.', 'Destiny: Infernal Flames: On Napalm Shot use, consume the effect.')).toMatchObject({line: 'Napalm Shot Damage +4.0%', scale: 50});
		expect(assumedDamage('Damage +4.0% per stack.', 'Max 50 stacks.')).toBeNull();
	});
	it('normalizes a timer or next-use bonus without adding casts', () => {
		expect(assumedDamage('Damage to foes +5.0% for 30.0s.', '')).toMatchObject({line: 'Damage to foes +5.0%', assumed: 'full-uptime', scale: 1});
		expect(assumedDamage('Damage of next Twin Shadows, Turning Slash, and Death Sentence +16.0% for 3 time(s).', '')).toMatchObject({line: 'Twin Shadows, Turning Slash, and Death Sentence Damage +16.0%', assumed: 'full-uptime'});
		expect(assumedDamage('Upon entering Barrage Mode, next Barrage: Howitzer Damage +15.0%.', '')).toMatchObject({line: 'Barrage: Howitzer Damage +15.0%', assumed: 'full-uptime'});
	});
	it.each([
		'Target Down Damage +30.0% per stack.',
		'Skill Cooldown +10.0% and Damage to foes +30.0% for 10.0s.',
		'With a different Skill Tree, Damage to foes +30.0% for 10.0s.',
		"The next Red Dragon's Horn Damage +12.0% for 1 use(s), and always hits as a Back Attack.",
		'On using Supreme Technique, next Yin Yang Palm Damage +30.0%.',
		'Damage from all party members +10% for 5.0s.'
	])('leaves unsupported damage conditions as text: %s', line => {
		expect(assumedDamage(line, '')).toBeNull();
	});
	it('keeps source caps and unknown targets distinct in the baked catalog', () => {
		expect(ORDER_CORE_EFFECTS[3350700].find(e => e.assumed)).toMatchObject({pct: .45, stacks: 5, skills: [35130]});
		expect(ORDER_CORE_EFFECTS[3302200].find(e => e.assumed)).toMatchObject({pct: 2, stacks: 50, skills: [30180]});
		expect(ORDER_CORE_EFFECTS[3381200].some(e => e.text?.includes('per stack'))).toBe(true); // No explicit cap.
		expect(ORDER_CORE_EFFECTS[3251700].find(e => e.assumed)?.skills).toEqual([25090, 25130, 25080]);
	});
});
