import { describe, expect, it } from 'vitest';
import type { RunSummary } from '$lib/logs/protocol';
import soulshan from './fixtures/na-soulshan.json';
import type { Loadout } from './types';
import { initSimState, type DpsLine, type SimState } from './simulate';
import { braceletPart } from './dps-stats';
import { engravingNames } from './dps-loadout';
import { gemMembers } from './dps-explain';
import { dpsMeter, matchSnapshot, meterGain } from './dps-meter';
import { orbSeason } from './paradise';
import { engravingTable } from './tables';

const loadout = soulshan as unknown as Loadout;
const base = initSimState(loadout);
const meter = { runs: 1, additionalDamage: .73, evoDamage: .56, attackPowerPct: .85, weaponPowerPct: .33, critRate: .15, critDamage: .36, mainStat: .055, weaponPower: .16, attackPower: .4 };
const damageGem = base.gems.findIndex((g) => g.kind === 'damage' && g.skill !== null && g.level < 10);
const gemSkill = gemMembers(base.gems[damageGem].skill!)[0];
const run = (id: number, extra: Partial<RunSummary> = {}): RunSummary => ({ id, start: id, boss: 'Death Incarnate Kazeros', difficulty: 'Hard', cleared: true, player: 'Soulshan', duration: 300_000,
	combatPower: 6000, itemLevel: 1784, spec: null, engravings: engravingNames(loadout), damage: 1000,
	skills: [{ id: gemSkill, damage: 600, critDamage: 0, hits: 1, crits: 0, casts: 1 }, { id: 99999, damage: 400, critDamage: 0, hits: 1, crits: 0, casts: 1 }],
	statValues: meter, critConversion: false, meterVersion: null, ...extra }) as RunSummary;

describe('DPS meter', () => {
	it('uses configured totals for a failed pull with no log stat values', () => {
		const context = {mainStat: 700000, weaponPower: 260000, baseAttackPct: 10, attackPowerPct: 0,
			flatAttack: 0, supportAttack: 0, additionalDamage: 40, evolutionDamage: 80, critRate: 70, critDamage: 200, critCap: 100};
		const failed = run(1, {cleared: false, statValues: null});
		const state = structuredClone(base); state.gear.weapon!.honing++;
		const m = dpsMeter(loadout, base, state, [], [failed], undefined, context)!;
		expect(m.statPct).toBeGreaterThan(0);
		expect(m.after).toBeGreaterThan(m.before);
		expect(meterGain(loadout, base, base, state, [], [failed], undefined, undefined, context).gainPct).toBeCloseTo(m.statPct!, 8);
		const conversionRun = {...failed, critConversion: true};
		// Unknown crit conversion does not block attack-only changes: that unchanged bucket cancels.
		expect(dpsMeter(loadout, base, state, [], [conversionRun], undefined, context)!.statPct).toBeGreaterThan(0);
	});
	it('keeps recorded Hyper Awakening damage fixed under an ordinary honing upgrade', () => {
		const state = structuredClone(base); state.gear.weapon!.honing++;
		const ordinary = run(1);
		const mixed = {...ordinary, skills: ordinary.skills.map((s, i) => ({...s, hyper: i === 1}))};
		const full = dpsMeter(loadout, base, state, [ordinary], [ordinary])!;
		const result = dpsMeter(loadout, base, state, [ordinary], [mixed])!;
		expect(result.skills.find((s) => s.id === 99999)!.after).toBe(400);
		expect(result.statPct).toBeCloseTo(full.statPct! * .6, 9);
		expect((result.after / result.before - 1) * 100).toBeCloseTo(result.statPct!, 9);
	});
	it('shows the recorded clear unchanged without edits', () => {
		const m = dpsMeter(loadout, base, base, [run(1)], [run(1)])!;
		expect(m.after).toBeCloseTo(m.before);
		expect(m.durationMs).toBe(300_000);
		expect(m.notInMeter).toEqual([]);
		expect(m.statPct).toBe(0);
	});
	it('a stat edit scales every skill by the same amount', () => {
		const state = structuredClone(base);
		state.gear.weapon!.honing += 1;
		const m = dpsMeter(loadout, base, state, [run(1)], [run(1)])!;
		expect(m.statPct!).toBeGreaterThan(0);
		const [a, b] = m.skills;
		expect(a.after / a.before).toBeCloseTo(b.after / b.before, 9);
		expect(m.after / m.before - 1).toBeCloseTo(m.statPct! / 100, 9);
	});
	it("a damage gem moves only its skills (plus a T4 gem's base attack for all)", () => {
		const state = structuredClone(base);
		state.gems[damageGem].level += 1;
		const m = dpsMeter(loadout, base, state, [run(1)], [run(1)])!;
		const gem = m.skills.find((s) => s.id === gemSkill)!, other = m.skills.find((s) => s.id === 99999)!;
		expect(gem.after / gem.before).toBeGreaterThan(other.after / other.before);
		expect(other.after).toBeGreaterThanOrEqual(other.before);
	});
	it("pairs gems by skill, not position: a clear's snapshot can list them in another order", () => {
		// The clear's baseline has the same gems, reversed; the loadout's damage gem then levels up.
		const clear = structuredClone(base);
		clear.gems.reverse();
		const state = structuredClone(base);
		state.gems[damageGem].level += 1;
		const m = dpsMeter(loadout, clear, state, [run(1)], [run(1)])!;
		expect(m.notInMeter).not.toContain('Gem swaps');
		const gem = m.skills.find((s) => s.id === gemSkill)!, other = m.skills.find((s) => s.id === 99999)!;
		expect(gem.after / gem.before).toBeGreaterThan(other.after / other.before);
		// Unchanged gems in another order are no change at all.
		expect(dpsMeter(loadout, clear, base, [run(1)], [run(1)])!.notInMeter).toEqual([]);
	});
	it('a cooldown gem adds casts as far as its skill sat on cooldown', () => {
		const index = base.gems.findIndex((g) => g.kind === 'cooldown' && g.skill !== null && g.level < 10);
		if (index < 0) return;
		const skill = gemMembers(base.gems[index].skill!)[0];
		const state = structuredClone(base);
		state.gems[index].level += 1;
		const withUse = (available: number) => run(1, { skills: [{ id: skill, damage: 600, critDamage: 0, hits: 1, crits: 0, casts: 1, timeAvailable: available }, { id: 99999, damage: 400, critDamage: 0, hits: 1, crits: 0, casts: 1 }] });
		const busy = dpsMeter(loadout, base, state, [run(1)], [withUse(0)])!, idle = dpsMeter(loadout, base, state, [run(1)], [withUse(300_000)])!;
		const ratio = (m: NonNullable<ReturnType<typeof dpsMeter>>, id: number) => { const s = m.skills.find((x) => x.id === id)!; return s.after / s.before; };
		expect(ratio(busy, skill)).toBeGreaterThan(ratio(busy, 99999) * 1.01);
		expect(ratio(idle, skill)).toBeCloseTo(ratio(idle, 99999), 9);
		expect(dpsMeter(loadout, base, state, [run(1)], [run(1)])!.notInMeter).toEqual(['Cooldown gems without cooldown data (1)']);
	});
	it("lists edits it doesn't count yet and leaves them out", () => {
		const state = structuredClone(base);
		state.karma.evolution = Math.min(30, (state.karma.evolution ?? 0) + 1);
		const m = dpsMeter(loadout, base, state, [run(1)], [run(1)])!;
		expect(m.notInMeter).toEqual(['Evolution Karma']);
		expect(m.after).toBeCloseTo(m.before);
	});
	it('sums several clears and their fight time', () => {
		const m = dpsMeter(loadout, base, base, [run(1), run(2)], [run(1), run(2)])!;
		expect(m.before).toBe(2000);
		expect(m.durationMs).toBe(600_000);
	});
});

describe('meter gain (Next Upgrades in DPS mode)', () => {
	it('is the change on the same meter, from the current edits', () => {
		const from = structuredClone(base);
		from.gems[damageGem].level += 1;
		const to = structuredClone(from);
		to.gear.weapon!.honing += 1;
		const g = meterGain(loadout, base, from, to, [run(1)], [run(1)]);
		const a = dpsMeter(loadout, base, from, [run(1)], [run(1)])!, b = dpsMeter(loadout, base, to, [run(1)], [run(1)])!;
		expect(g.gainPct!).toBeGreaterThan(0);
		expect(g.gainPct!).toBeCloseTo((b.after / a.after - 1) * 100, 9);
		expect(g.atLeast).toBe(false);
	});
	it("is unknown, not zero, for an edit the meter doesn't value", () => {
		const to = structuredClone(base);
		if (to.karma.evolution !== null) to.karma.evolution = Math.min(30, to.karma.evolution + 1);
		else to.karma.leap = (to.karma.leap ?? 0) + 1;
		expect(meterGain(loadout, base, base, to, [run(1)], [run(1)]).gainPct).toBeNull();
	});
	it("values Paradise power on the orb's proc (Thunder Charge, its own skill), and lists an orb swap", () => {
		expect(base.paradise).not.toBeNull();
		// A proc dealing 3% of the damage.
		const r = run(1, { damage: 1000, skills: [{ id: gemSkill, damage: 970, critDamage: 0, hits: 1, crits: 0, casts: 1 }, { id: 171000907, damage: 30, critDamage: 0, hits: 1, crits: 0, casts: 1 }] });
		const up = structuredClone(base);
		for (const season of Object.keys(up.paradise!.powers)) up.paradise!.powers[Number(season)] += 1_000_000;
		const m = dpsMeter(loadout, base, up, [r], [r])!;
		expect(m.notInMeter).toEqual([]);
		const proc = m.skills.find((s) => s.id === 171000907)!, other = m.skills.find((s) => s.id === gemSkill)!;
		expect(proc.after).toBeGreaterThan(proc.before);
		expect(other.after).toBeCloseTo(other.before);
		const swap = structuredClone(base);
		swap.paradise!.orb = swap.paradise!.orb + 1;
		expect(dpsMeter(loadout, base, swap, [r], [r])!.notInMeter).toContain('Paradise orb swap');
	});
	it('values an engraving step at its damage table, on every skill', () => {
		const up = structuredClone(base);
		const e = up.engravings[1299]; // Adrenaline: relic books 20, stone 0 (19.40%)
		expect(e).toEqual({ books: 4, stone: 0 });
		e.stone = 1;
		const t = engravingTable(1299)!;
		const m = dpsMeter(loadout, base, up, [run(1)], [run(1)])!;
		expect(m.notInMeter).toEqual([]);
		expect(m.after / m.before).toBeCloseTo((1 + t[1][4] / 1e4) / (1 + t[0][4] / 1e4), 9);
		expect(meterGain(loadout, base, base, up, [run(1)], [run(1)]).gainPct).toBeGreaterThan(0);
	});
	it('values an Outgoing Damage line as a damage multiplier, not a note', () => {
		const up = structuredClone(base);
		const line = up.accessories.neck!.find((ln): ln is DpsLine => ln.key === 'outgoing_dmg')!;
		expect(line.tier).toBe('mid');
		line.tier = 'high';
		const m = dpsMeter(loadout, base, up, [run(1)], [run(1)])!;
		expect(m.notes.join(' ')).not.toContain('Outgoing Damage');
		expect(m.after / m.before).toBeCloseTo(1.02 / 1.012, 9);
	});
	describe('bracelet effects', () => {
		const ASTAROS = 46430, REAPERS_SCYTHE = 46500; // non-directional; a back attack
		const positional = () => run(1, { damage: 1000, skills: [
			{ id: ASTAROS, damage: 600, critDamage: 0, hits: 1, crits: 0, casts: 1, front: 0, back: 0 },
			{ id: REAPERS_SCYTHE, damage: 400, critDamage: 0, hits: 1, crits: 0, casts: 1, front: 0, back: 400 }
		] });
		const lines = (s: SimState) => s.bracelet!.lines;
		const effect = (s: SimState, prefix: string) => lines(s).find((x): x is { kind: 'effect'; key: string } => x.kind === 'effect' && x.key.startsWith(prefix))!;
		it('swaps non-directional damage for back attack damage on the skills each applies to', () => {
			const up = structuredClone(base);
			const nd = braceletPart(effect(base, '4:6051001').key)!.nonDirectional;
			effect(up, '4:6051001').key = '4:605100151'; // Back Attack Damage +3.5%
			const r = positional();
			const m = dpsMeter(loadout, base, up, [r], [r])!;
			expect(m.notInMeter).toEqual([]);
			expect(m.skills.find((s) => s.id === ASTAROS)!.after).toBeCloseTo(600 / (1 + nd / 100), 6);
			expect(m.skills.find((s) => s.id === REAPERS_SCYTHE)!.after).toBeCloseTo(400 * 1.035, 6);
		});
		it('reads a roll within a family as its stat; the same conditional part on both sides is not listed', () => {
			const up = structuredClone(base);
			effect(up, '3:1104').key = '3:11041'; // Additional Damage +3.5% (and the same vs. Demons bonus)
			const m = dpsMeter(loadout, base, up, [run(1)], [run(1)])!;
			expect(m.notInMeter).toEqual([]);
			expect(meterGain(loadout, base, base, up, [run(1)], [run(1)]).gainPct).toBeGreaterThan(0);
		});
		it('values Crit as Crit Rate and lists Specialization', () => {
			const crit = structuredClone(base);
			(lines(crit).find((x) => x.kind === 'stat' && x.index === 15) as { value: number }).value += 20;
			expect(meterGain(loadout, base, base, crit, [run(1)], [run(1)]).gainPct).toBeGreaterThan(0);
			const spec = structuredClone(base);
			(lines(spec).find((x) => x.kind === 'stat' && x.index === 16) as { value: number }).value += 20;
			expect(dpsMeter(loadout, base, spec, [run(1)], [run(1)])!.notInMeter).toEqual(['Bracelet: Specialization +97']);
		});
	});
	it("moves a proc only with its own season's power: a Season 3 orb's Broadwave keeps its hit", () => {
		const season = orbSeason(base.paradise!.orb)!;
		const broadwave = 170000706, thunder = 171000907;
		const r = (proc: number) => run(1, { damage: 1000, skills: [{ id: gemSkill, damage: 970, critDamage: 0, hits: 1, crits: 0, casts: 1 }, { id: proc, damage: 30, critDamage: 0, hits: 1, crits: 0, casts: 1 }] });
		const s4 = structuredClone(base);
		s4.paradise!.powers[4] += 1_000_000;
		const old = dpsMeter(loadout, base, s4, [r(broadwave)], [r(broadwave)])!;
		expect(old.skills.find((s) => s.id === broadwave)!.after).toBeCloseTo(30);
		if (season === 4) expect(old.notes).toContain('Paradise power: this run was on another orb.');
		const s3 = structuredClone(base);
		s3.paradise!.powers[3] += 1_000_000;
		expect(dpsMeter(loadout, base, s3, [r(thunder)], [r(thunder)])!.skills.find((s) => s.id === thunder)!.after).toBeCloseTo(30);
		expect(dpsMeter(loadout, base, s3, [r(broadwave)], [r(broadwave)])!.skills.find((s) => s.id === broadwave)!.after).toBeGreaterThan(30);
	});
	it("values Leap Karma on Hyper Awakening damage only (+0.5% a level)", () => {
		const leap = base.karma.leap ?? 0;
		const up = structuredClone(base);
		up.karma.leap = Math.min(29, leap) + 1;
		const r = run(1, { skills: [{ id: gemSkill, damage: 900, critDamage: 0, hits: 1, crits: 0, casts: 1 }, { id: 46640, damage: 100, critDamage: 0, hits: 1, crits: 0, casts: 1, hyper: true }] });
		const m = dpsMeter(loadout, base, up, [r], [r])!;
		expect(m.notInMeter).toEqual([]);
		expect(m.skills.find((s) => s.id === 46640)!.after).toBeCloseTo(100 * (1 + 0.005 * up.karma.leap!) / (1 + 0.005 * leap), 9);
		expect(m.skills.find((s) => s.id === gemSkill)!.after).toBeCloseTo(900, 9);
	});
	it("values Enlightenment Karma (Weapon Power) but not Evolution Karma's HP and CP bonus", () => {
		expect(base.karma.enlightenment).not.toBeNull();
		const up = structuredClone(base);
		up.karma.enlightenment = Math.min(29, base.karma.enlightenment!) + 1;
		expect(meterGain(loadout, base, base, up, [run(1)], [run(1)]).gainPct).toBeGreaterThan(0);
		expect(dpsMeter(loadout, base, up, [run(1)], [run(1)])!.notInMeter).toEqual([]);
	});
	it('is unknown too when the clear already differed there (its Karma), not +0.00%', () => {
		const clear = structuredClone(base);
		clear.karma.evolution = Math.max(0, (clear.karma.evolution ?? 1) - 1);
		const to = structuredClone(base);
		to.karma.evolution = Math.min(30, (to.karma.evolution ?? 0) + 1);
		expect(meterGain(loadout, clear, base, to, [run(1)], [run(1)]).gainPct).toBeNull();
	});
	it("is unknown for a stat edit when no clear has the meter's stat values", () => {
		const to = structuredClone(base);
		to.gear.weapon!.honing += 1;
		const bare = run(1, { statValues: undefined });
		expect(meterGain(loadout, base, base, to, [bare], [bare]).gainPct).toBeNull();
	});
});

describe('clear baseline', () => {
	it('matches a snapshot within 0.5% CP, closest first', () => {
		const snaps = [{ id: 'a', cp: 6100 }, { id: 'b', cp: 6020 }, { id: 'c', cp: 6005 }];
		expect(matchSnapshot(6000, snaps)?.id).toBe('c');
		expect(matchSnapshot(5000, snaps)).toBeNull();
		expect(matchSnapshot(null, snaps)).toBeNull();
	});
});

describe('chaos cores and astrogem options', async () => {
	const { orderCoreEffect } = await import('./ark-grid-dps');
	const { gridStats } = await import('./dealer-grid-stats');
	const r = run(1, { skills: [{ id: gemSkill, damage: 600, critDamage: 300, hits: 1, crits: 1, casts: 1 }, { id: 99999, damage: 400, critDamage: 0, hits: 1, crits: 0, casts: 1 }] });
	it("reads the chaos cores' lines at their points, and the astrogem options", () => {
		const g = gridStats(loadout, base);
		expect(g.damage).toBeGreaterThan(0); // Flashy Attack / Absorbing Strike: Damage to foes
		expect(g.atkFlat).toBeGreaterThan(0); // the Attack star
		expect(g.addDmg).toBeGreaterThan(0); // Additional Damage astrogems
	});
	it('a chaos core losing points loses its damage, more on the skill that crits (On Crit Hit damage)', () => {
		const state = structuredClone(base);
		const flashy = state.arkGrid.find((c) => String(c.as ?? c.id).startsWith('6731000'));
		expect(flashy).toBeDefined();
		flashy!.gems.find((g) => !g.removed)!.removed = true;
		const m = dpsMeter(loadout, base, state, [r], [r], orderCoreEffect)!;
		expect(m.after).toBeLessThan(m.before);
		expect(m.notInMeter).toEqual([]);
		const crit = m.skills.find((s) => s.id === gemSkill)!, none = m.skills.find((s) => s.id === 99999)!;
		expect(crit.after / crit.before).toBeLessThan(none.after / none.before);
	});
	it('an Additional Damage astrogem level counts as Additional Damage', () => {
		const state = structuredClone(base);
		const opt = state.arkGrid.flatMap((c) => c.gems).flatMap((g) => g.opts).find((o) => o.id === 2002 && o.level < 5)!;
		opt.level += 1;
		const g = meterGain(loadout, base, base, state, [r], [r], orderCoreEffect);
		expect(g.gainPct).toBeGreaterThan(0);
	});
});

describe('Paradise orb proc', () => {
	it('stays put under gear edits: it hits for a fixed amount', () => {
		const r = run(1, { damage: 1000, skills: [{ id: gemSkill, damage: 970, critDamage: 0, hits: 1, crits: 0, casts: 1 }, { id: 171000907, damage: 30, critDamage: 0, hits: 1, crits: 0, casts: 1 }] });
		const state = structuredClone(base);
		state.gear.weapon!.honing += 1;
		const m = dpsMeter(loadout, base, state, [r], [r])!;
		const proc = m.skills.find((s) => s.id === 171000907)!, other = m.skills.find((s) => s.id === gemSkill)!;
		expect(other.after).toBeGreaterThan(other.before);
		expect(proc.after).toBe(proc.before);
	});
});
