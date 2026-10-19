import { describe, expect, it } from 'vitest';
import type { RunSummary } from '$lib/logs/protocol';
import soulshan from './fixtures/na-soulshan.json';
import type { Loadout } from './types';
import { initSimState } from './simulate';
import { liveUpgrades } from './live-upgrades';
import { engravingNames } from './dps-loadout';
import { gemMembers } from './dps-explain';
import { clearSpread, combinedGain, comparisonSample, comparisonScope, compareDpsUpgrades, dpsCpRanks, formatDamage, orderSetup, rankDpsCandidates, recordedDps, runCooldownUse, statWorth, type DpsCandidate } from './dps-comparison';

const loadout = soulshan as unknown as Loadout;
const state = initSimState(loadout);
const meter = { runs: 1, additionalDamage: .73, evoDamage: .56, attackPowerPct: .85, weaponPowerPct: .33, critRate: .15, critDamage: .36, mainStat: .055, weaponPower: .16, attackPower: .4 };
const run = (id: number, damage = 100): RunSummary => ({ id, start: id, boss: 'Death Incarnate Kazeros', difficulty: 'Hard', cleared: true, player: 'Soulshan', duration: 60_000, combatPower: 6000, itemLevel: 1750, spec: null, engravings: engravingNames(loadout), damage,
	skills: [{ id: 1, damage, critDamage: 0, hits: 1, crits: 0, casts: 1 }], statValues: meter, critConversion: false, meterVersion: null });

describe('DPS comparison scope', () => {
	it('excludes different characters, failed fights, invalid totals and known engraving mismatches', () => {
		const list = [run(1), { ...run(2), player: 'Other' }, { ...run(3), cleared: false }, { ...run(4), damage: NaN }, { ...run(5), duration: 0 }, { ...run(6), engravings: ['different'] }];
		const scope = comparisonScope(loadout, list, 'soulshan');
		expect(scope.included.map(r => r.id)).toEqual([1]);
		expect(scope.excluded.map(x => x.reason)).toEqual(['Different character', 'Not a clear', 'Incomplete damage data', 'Incomplete damage data', 'Different engravings']);
	});
	it('matches all three recorded Order choices and excludes missing data only when filtered', () => {
		const list = [{ ...run(1), arkGridOrder: { sun: 3, moon: 3, star: 3 } }, { ...run(2), arkGridOrder: { sun: 1, moon: 1, star: 1 } }, run(3)];
		expect(orderSetup(list[0])).toBe('3/3/3');
		expect(comparisonScope(loadout, list, 'Soulshan').included).toHaveLength(3);
		const scope = comparisonScope(loadout, list, 'Soulshan', '3/3/3');
		expect(scope.included.map(r => r.id)).toEqual([1]);
		expect(scope.excluded.map(x => x.reason)).toEqual(['Different Order cores', 'Order cores not recorded']);
	});
	it('reports old imports without engravings as unchecked', () => {
		expect(comparisonScope(loadout, [{ ...run(1), engravings: [] }], 'Soulshan').unchecked).toBe(1);
	});
});

describe('combined DPS gain', () => {
	it('uses total baseline/target damage over the identical fight time, not average gain', () => {
		const a = run(1, 100), b = { ...run(2, 900), duration: 180_000 };
		expect(combinedGain([{ run: a, gainPct: 10 }, { run: b, gainPct: 2 }])).toBeCloseTo(2.8);
		expect(comparisonSample([a, { ...b, skills: [{ ...b.skills[0], id: 2 }] }]).skillShares[1]).toBeCloseTo(10);
	});
	it('does not rank partial coverage or an empty cohort', () => {
		expect(combinedGain([{ run: run(1), gainPct: 3 }, { run: run(2), gainPct: null }])).toBeNull();
		expect(combinedGain([])).toBeNull();
	});
	it('scores individual damage gems per clear, and leaves cooldown and unsupported effects unestimated', () => {
		const upgrades = liveUpgrades(loadout, state, state, undefined, true);
		const damage = upgrades.find(u => u.category === 'gem' && u.title.startsWith('Damage'))!;
		const skill = state.gems[Number(damage.key.split(':')[3])].skill!;
		const member = gemMembers(skill)[0];
		const a = { ...run(1), skills: [{ ...run(1).skills[0], id: member, damage: 60 }] };
		const b = { ...run(2, 900), skills: [{ ...run(2).skills[0], id: member, damage: 90 }] };
		const list = compareDpsUpgrades(loadout, state, state, [a, b], [a, b], upgrades);
		const gem = list.find(c => c.id === damage.key)!;
		expect(gem.covered).toBe(2);
		expect(gem.clears[0].gainPct).toBeGreaterThan(gem.clears[1].gainPct!);
		expect(gem.gainPct).toBeCloseTo((gem.clears[0].gainPct! * 100 + gem.clears[1].gainPct! * 900) / 1000);
		expect(list.filter(c => c.gem?.rough).every(c => c.gainPct === null)).toBe(true);
		expect(list.filter(c => c.upgrade.category === 'core').every(c => c.gainPct === null)).toBe(true);
	});
	it('a clear without stat values takes Crit Rate from the clears that have it, and says so', () => {
		const current = structuredClone(state);
		current.accessories.finger1 = [{ key: 'crit_rate', tier: 'low' }, { key: 'crit_dmg', tier: 'low' }, { key: 'atk_flat', tier: 'low' }];
		const upgrades = liveUpgrades(loadout, current, state, undefined, true);
		const a = run(1), b = { ...run(2), statValues: null };
		const list = compareDpsUpgrades(loadout, current, state, [a, b], [a, b], upgrades);
		const crit = list.find(c => c.stat?.delta.critRate);
		expect(crit).toBeDefined();
		expect(crit!.covered).toBe(2);
		expect(crit!.clears[1].gainPct).toBeCloseTo(crit!.clears[0].gainPct!);
		expect(crit!.gainPct).not.toBeNull();
		expect(crit!.notes.join(' ')).toMatch(/1 of 2 clears/);
		const weapon = list.find(c => c.upgrade.key.startsWith('honing:weapon:'))!;
		expect(weapon.gainPct).toBeGreaterThan(0);
		expect(weapon.notes).toEqual([]);
		// No clear has Crit Rate at all: still unranked.
		const none = compareDpsUpgrades(loadout, current, state, [a, b], [{ ...a, statValues: null }, b], upgrades).find(c => c.id === crit!.id)!;
		expect(none.gainPct).toBeNull();
		const large = { ...b, damage: 900, statValues: { ...meter, critRate: .45 } };
		const complete = compareDpsUpgrades(loadout, current, state, [a, large], [a, large], upgrades).find(c => c.id === crit!.id)!;
		expect(complete.stat!.parts.find(p => p.key === 'critRate')!.gainPct).toBeCloseTo(complete.stat!.delta.critRate * (.15 * .1 + .45 * .9));
	});
});

describe('gems without the meter\'s stat values', () => {
	it('rank on the skill share and note that the base-attack bonus is left out', () => {
		const upgrades = liveUpgrades(loadout, state, state, undefined, true);
		const damage = upgrades.find(u => u.category === 'gem' && u.title.startsWith('Damage'))!;
		const skill = state.gems[Number(damage.key.split(':')[3])].skill!;
		const bare = { ...run(1), statValues: null, skills: [{ ...run(1).skills[0], id: gemMembers(skill)[0], damage: 50 }] };
		const gem = compareDpsUpgrades(loadout, state, state, [bare], [bare], upgrades).find(c => c.id === damage.key)!;
		expect(gem.gainPct).toBeCloseTo(gem.gem!.effectPct / 2);
		if (gem.gem!.baseAttack) expect(gem.notes.join(' ')).toMatch(/Base Atk\. Power bonus not included/);
	});
});

describe('DPS ranking', () => {
	const candidate = (id: string, gainPct: number | null, cpPct = 1) => ({ id, gainPct, cpPct }) as DpsCandidate;
	it('keeps unknown prices and nonpositive DPS out of the efficiency ranking; zero gold is valid', () => {
		const list = [candidate('unpriced', 10), candidate('paid', 2), candidate('free', 1), candidate('unknown', null), candidate('zero', 0)];
		expect(rankDpsCandidates(list, { paid: 100, free: 0, unknown: 0, zero: 0 }, 'gold').map(c => c.id)).toEqual(['free', 'paid', 'unpriced', 'zero', 'unknown']);
		expect(rankDpsCandidates(list, {}, 'dps')[0].id).toBe('unpriced');
		expect(rankDpsCandidates([candidate('a', 5, 1), candidate('b', null, 2)], {}, 'cp')[0].id).toBe('b');
	});
});

describe('DPS headline and ranks', () => {
	it('reads recorded DPS as total damage over total seconds', () => {
		expect(recordedDps([run(1, 6_000), { ...run(2, 12_000), duration: 120_000 }])).toBeCloseTo(100);
		expect(recordedDps([])).toBeNull();
		expect([formatDamage(312.4e6), formatDamage(3.741e6), formatDamage(1.024e9), formatDamage(45.33e3), formatDamage(950)]).toEqual(['312m', '3.74m', '1.02b', '45.3k', '950']);
	});
	it('ranks slots by DPS and by CP, skipping unestimated rows and collapsing slot alternatives', () => {
		const c = (id: string, gainPct: number | null, cpPct: number, group?: string) =>
			({ id, gainPct, cpPct, upgrade: { key: id, category: group ? 'accessory' : 'gem', group } }) as unknown as DpsCandidate;
		const ranks = dpsCpRanks([c('a', 3, 0.1), c('b', 2, 0.5), c('n1', 1, 0.9, 'neck'), c('n2', 0.5, 0.2, 'neck'), c('x', null, 5)]);
		expect(ranks.get('a')).toEqual({ dps: 1, cp: 3 });
		expect(ranks.get('n1')).toEqual({ dps: 3, cp: 1 });
		expect(ranks.get('n2')).toEqual({ dps: 3, cp: 2 });
		expect(ranks.has('x')).toBe(false);
	});
});

describe('replays, cooldown gems as played, and stat worth', () => {
	it('reads a clear\'s cooldown use from the skill\'s ready-but-unused time', () => {
		const r = { ...run(1), skills: [{ ...run(1).skills[0], timeAvailable: 15_000 }, { ...run(1).skills[0], id: 2 }] };
		expect(runCooldownUse(r)).toEqual({ 1: 75 });
	});
	it('gives the newest clear, the range and the median of an upgrade\'s per-clear gains', () => {
		const spread = clearSpread([{ run: run(1), gainPct: 1 }, { run: run(3), gainPct: 0.5 }, { run: run(2), gainPct: 2 }, { run: run(4), gainPct: null }])!;
		expect(spread.latest.run.id).toBe(3);
		expect([spread.low, spread.high, spread.median, spread.count]).toEqual([0.5, 2, 1, 3]);
		expect(clearSpread([{ run: run(1), gainPct: null }])).toBeNull();
	});
	it('values a cooldown gem per clear from that clear\'s cooldown use, outside the ranking', () => {
		const upgrades = liveUpgrades(loadout, state, state, undefined, true);
		const cd = upgrades.find(u => u.category === 'gem' && u.title.startsWith('Cooldown'))!;
		expect(cd).toBeDefined();
		const skill = state.gems[Number(cd.key.split(':')[3])].skill!;
		const id = gemMembers(skill)[0];
		// Same share of damage; pressed on cooldown in one clear (ready 0 s), ready half the fight in the other.
		const busy = { ...run(1), skills: [{ ...run(1).skills[0], id, damage: 50, timeAvailable: 0 }, { ...run(1).skills[0], id: 999, damage: 50 }] };
		const idle = { ...run(2), skills: [{ ...run(2).skills[0], id, damage: 50, timeAvailable: 30_000 }, { ...run(2).skills[0], id: 999, damage: 50 }] };
		const unknown = { ...run(3), skills: [{ ...run(3).skills[0], id, damage: 50 }, { ...run(3).skills[0], id: 999, damage: 50 }] };
		const gem = compareDpsUpgrades(loadout, state, state, [busy, idle, unknown], [busy, idle, unknown], upgrades).find(c => c.id === cd.key)!;
		expect(gem.gainPct).toBeNull();
		const [b, i, u] = gem.asPlayed!.clears;
		expect(b.gainPct!).toBeGreaterThan(i.gainPct!);
		expect(i.gainPct!).toBeGreaterThan(0);
		expect(u.gainPct).toBeNull();
		expect(gem.asPlayed!.covered).toBe(2);
		expect(gem.asPlayed!.gainPct).toBeCloseTo(combinedGain([b, i])!);
	});
	it('says what one more of each stat is worth, with Crit Rate only where it was measured', () => {
		const worth = statWorth(loadout, state, state, [run(1)], [run(1)])!;
		const value = (k: string) => worth.rows.find(r => r.key === k)!.gainPct;
		expect(value('critRate')).toBeCloseTo(meter.critRate);
		expect(value('critDamage')).toBeCloseTo(meter.critDamage);
		expect(worth.critVsDamage).toBeCloseTo(meter.critRate / meter.critDamage);
		const bare = statWorth(loadout, state, state, [run(1)], [{ ...run(2), statValues: null }])!;
		expect(bare.rows.find(r => r.key === 'critRate')!.gainPct).toBeNull();
		expect(bare.critVsDamage).toBeNull();
	});
});
