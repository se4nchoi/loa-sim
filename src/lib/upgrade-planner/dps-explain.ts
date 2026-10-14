// Explains upgrades for the DPS tab. A gem: which skills it touches, how much harder (or more often) they hit, and
// how that holds run by run. A stat upgrade (honing, quality, accessories, bracelet, …): which damage buckets it
// moves, valued with our stat model (dps-model.ts). Both are compared on the current plan, one step at a time.

import type { RunSummary } from '$lib/logs/protocol';
import { applyUpgrade } from './apply-upgrade';
import { bracerStats } from './bracer';
import { modelGain, modelInput, type GainPart, type ModelInput } from './dps-model';
import { statDeltas, type StatDeltas } from './dps-stats';
import { GEM_BASE_ATTACK, GEM_EFFECTS, GEM_SKILL_GROUPS, GEM_SKILLS } from './game-data';
import { liveUpgrades } from './live-upgrades';
import { gemParts, simulate, type SimState } from './simulate';
import type { Loadout } from './types';

const NO_STATS: StatDeltas = { mainStat: 0, weaponPower: 0, additionalDamage: 0, critRate: 0, critDamage: 0, attackPowerPct: 0, attackPower: 0 };
const cpGain = (loadout: Loadout, state: SimState, after: SimState, base: SimState) => {
	const cp0 = simulate(loadout, state, base).cp;
	return cp0 > 0 ? (simulate(loadout, after, base).cp / cp0 - 1) * 100 : 0;
};

/** Base attack % already on the character: T4 gems and the bracer. */
export function baseAttackOf(loadout: Loadout, state: SimState): number {
	const parts = gemParts(loadout);
	return state.gems.reduce((sum, g, i) => sum + ((g.tier ?? parts[i]?.tier) === 'T4' ? GEM_BASE_ATTACK[g.level - 1] ?? 0 : 0), 0) + bracerStats(state.bracer).attackPercent;
}

/** The stat model for this plan: its main stat, Weapon Power and base attack, with buckets from the runs. */
export function planModel(loadout: Loadout, state: SimState, base: SimState, allRuns: RunSummary[], gateRuns: RunSummary[]) {
	const sim = simulate(loadout, state, base);
	return modelInput(allRuns, gateRuns, sim.mainStat, sim.weaponPower, baseAttackOf(loadout, state));
}

export interface GemChoice {
	index: number;
	skill: number;
	name: string;
	kind: 'damage' | 'cooldown';
	from: number;
	to: number;
	label: string;
}

/** One level up on each skill gem of the current plan. */
export function gemChoices(loadout: Loadout, state: SimState): GemChoice[] {
	const parts = gemParts(loadout);
	return state.gems.flatMap((gem, index) => {
		if (gem.skill === null || gem.level >= 10 || !parts[index]?.table) return [];
		const name = GEM_SKILLS[gem.skill]?.[0] ?? `Skill ${gem.skill}`;
		const kind = gem.kind === 'damage' ? 'damage' : 'cooldown';
		return [{ index, skill: gem.skill, name, kind, from: gem.level, to: gem.level + 1,
			label: `${name} · ${kind === 'damage' ? 'Damage' : 'Cooldown'} gem ${gem.level} → ${gem.level + 1}` }];
	});
}

export interface SkillPart {
	skill: number;
	name: string;
	/** Percent of the player's damage. */
	share: number;
	gainPct: number;
}

export interface GemExplanation {
	choice: GemChoice;
	/** Same total as Next Upgrades; null when it can't be estimated. */
	gainPct: number | null;
	cpPct: number;
	/** How much harder (damage) or more often (cooldown) the gem's skills hit, in percent. */
	effectPct: number;
	/** Cast-count multiplier from cooldown use; only for cooldown gems. */
	cooldownUse?: number;
	parts: SkillPart[];
	/** DPS from the base attack the gem adds (every skill); null when the model can't value attack. */
	baseAttackPct: number | null;
	/** Base attack % the gem adds. */
	baseAttack: number;
	/** Cooldown gems assume extra casts cost nothing, so they likely overstate the gain. */
	rough: boolean;
	missing: string[];
}

const effect = (tier: 'T4' | 'T3', kind: 'damage' | 'cooldown', level: number) => (GEM_EFFECTS[tier][kind][level - 1] ?? 0) / 1e4;

/** Logged skills the gem applies to: itself, or its group's members (e.g. Twelve Forms). */
export const gemMembers = (skill: number) => GEM_SKILL_GROUPS[skill] ?? [skill];

/** Percent more damage per skill from the gem change alone, same formula as gemDpsGainPct. */
function skillEffect(loadout: Loadout, state: SimState, choice: GemChoice, cooldownUse: Record<number, number>) {
	const tier = state.gems[choice.index].tier ?? gemParts(loadout)[choice.index]?.tier ?? 'T4';
	if (choice.kind === 'damage') return { effectPct: ((1 + effect(tier, 'damage', choice.to)) / (1 + effect(tier, 'damage', choice.from)) - 1) * 100 };
	const k = (1 - effect(tier, 'cooldown', choice.to)) / (1 - effect(tier, 'cooldown', choice.from));
	const members = gemMembers(choice.skill).map(m => cooldownUse[m]).filter((n): n is number => n !== undefined);
	const u = Math.max(0, Math.min(1, (cooldownUse[choice.skill] ?? (members.length ? Math.max(...members) : 100)) / 100));
	return { effectPct: (1 / (1 - u + u * k) - 1) * 100, cooldownUse: u * 100 };
}

export function explainGem(loadout: Loadout, state: SimState, base: SimState, choice: GemChoice,
	shares: Record<number, number>, cooldownUse: Record<number, number>, model: ModelInput): GemExplanation {
	const after = structuredClone(state);
	after.gems[choice.index] = { ...after.gems[choice.index], level: choice.to };
	const cpPct = cpGain(loadout, state, after, base);
	const baseAttack = baseAttackOf(loadout, after) - baseAttackOf(loadout, state);
	const attack = baseAttack ? modelGain({ ...NO_STATS, baseAttackPct: baseAttack }, model).gainPct : 0;
	const { effectPct, cooldownUse: u } = skillEffect(loadout, state, choice, cooldownUse);
	const parts = gemMembers(choice.skill).flatMap(id => shares[id] === undefined ? [] : [{
		skill: id, name: GEM_SKILLS[id]?.[0] ?? (gemMembers(choice.skill).length > 1 ? `Skill ${id}` : choice.name),
		share: shares[id], gainPct: shares[id] / 100 * effectPct }]);
	if (!parts.length && shares[choice.skill] !== undefined)
		parts.push({ skill: choice.skill, name: choice.name, share: shares[choice.skill], gainPct: shares[choice.skill] / 100 * effectPct });
	const missing: string[] = [];
	if (!parts.length) missing.push(`No damage share for ${choice.name} in your logs.`);
	if (attack === null) missing.push("Base attack left out: no recent run with the meter's stat values.");
	const skillPct = parts.reduce((sum, p) => sum + p.gainPct, 0);
	// Without the skill's share only the base attack part is known; don't present that as the gem's gain.
	return { choice, gainPct: parts.length ? ((1 + skillPct / 100) * (1 + (attack ?? 0) / 100) - 1) * 100 : null, cpPct, effectPct, cooldownUse: u, parts,
		baseAttackPct: attack, baseAttack, rough: choice.kind === 'cooldown', missing };
}

export interface StatExplanation {
	key: string;
	label: string;
	/** Upgrade category, e.g. "honing", "accessory". */
	category: string;
	/** Alternatives that exclude each other (e.g. one accessory slot's options) share a group. */
	group: string;
	gainPct: number | null;
	cpPct: number;
	delta: StatDeltas;
	parts: GainPart[];
	missing: string[];
}

/** Next Upgrades' candidates that only move stats the model covers, each valued on the current plan. */
export function statExplanations(loadout: Loadout, state: SimState, base: SimState, model: ModelInput): StatExplanation[] {
	const seen = new Set<string>();
	return liveUpgrades(loadout, state, base, undefined, true).flatMap(u => {
		if (u.category === 'gem') return [];
		const after = structuredClone(state);
		if (!applyUpgrade(loadout, after, base, u)) return [];
		const delta = statDeltas(loadout, state, after, base);
		if (!delta || Object.values(delta).every(v => !v)) return [];
		const label = [u.subject, u.lines?.map(l => `${l.name} ${l.tier}`).join(', ') || u.title].filter(Boolean).join(' · ');
		if (seen.has(label)) return [];
		seen.add(label);
		const gain = modelGain(delta, model);
		return [{ key: u.key, label, category: u.category, group: u.group ?? u.key, gainPct: gain.gainPct, cpPct: cpGain(loadout, state, after, base), delta, parts: gain.parts, missing: gain.missing }];
	});
}

export interface RunGain {
	id: number;
	start: number;
	boss: string;
	difficulty: string;
	/** The gem's skills' share of the player's damage in this run, in percent. */
	share: number;
	/** Skill-effect part only; the base attack part is the same for every run. */
	gainPct: number;
}

/** The skill-effect part run by run, from each run's own skill damage. */
export function runGains(runs: RunSummary[], explanation: GemExplanation): RunGain[] {
	const ids = new Set([...gemMembers(explanation.choice.skill), explanation.choice.skill]);
	return runs.filter(r => r.damage > 0).map(r => {
		const share = r.skills.filter(s => ids.has(s.id)).reduce((sum, s) => sum + s.damage, 0) / r.damage * 100;
		return { id: r.id, start: r.start, boss: r.boss, difficulty: r.difficulty, share, gainPct: share / 100 * explanation.effectPct };
	}).sort((a, b) => b.start - a.start);
}
