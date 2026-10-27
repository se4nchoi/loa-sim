import type { ClearSnapshot } from '$lib/bible-data';
import type { RunSummary } from '$lib/logs/protocol';
import { CARD_DAMAGE_STATS, ENGRAVING_ADDITIONAL_DAMAGE, MASTER_STATS, PASSIVE_DAMAGE_STATS } from './damage-context-data';
import { gridStats } from './dealer-grid-stats';
import { braceletPart, equipmentDamageStats } from './dps-stats';
import { ACCESSORY_SLOTS, braceletEffects, type SimState } from './simulate';
import type { DamageContext } from './dps-stat-engine';
import type { Loadout } from './types';
import { PartType } from './cp';
import { ACCESSORY_LINES } from './tables';
import { engravingDamageStats } from './engraving-damage-stats';
import { isParadiseProc } from './dealer-grid-stats';

/** Known static totals, with unresolved combat inputs kept separate from numeric zero. */
export interface GearDamageContext {
	totals: Partial<DamageContext>;
	missing: string[];
	assumptions: string[];
	/** Per-skill fractional gains; absent when a trace or relevant buff value is unresolved. */
	skills: Record<number, {attackPowerPct: number}>;
}

/** Reconstruct only buckets whose sources we can identify. No typical support stats or observed crit cap invented. */
export function gearDamageContext(loadout: Loadout, baseline: SimState, run: Pick<RunSummary, 'arkPassives'> & Partial<Pick<RunSummary, 'skills'>>, snapshot: ClearSnapshot): GearDamageContext {
	const gear = equipmentDamageStats(baseline), grid = gridStats(loadout, baseline);
	const totals: Partial<DamageContext> = {};
	const missing: string[] = [], assumptions: string[] = [];
	const skills: GearDamageContext['skills'] = {};
	const engraving = engravingDamageStats(baseline);
	let attackPowerPct = (gear.attackPowerPct ?? 0) + grid.atkPct + (engraving.attackPowerPct ?? NaN);
	let attackKnown = loadout.classId.replaceAll('_', '').toLowerCase() === 'souleater';
	let additionalDamage = (gear.additionalDamage ?? 0) + grid.addDmg;
	let known = true;
	const fail = (reason: string) => { known = false; missing.push(reason); };
	if (snapshot.classId.replaceAll('_', '').toLowerCase() !== loadout.classId.replaceAll('_', '').toLowerCase()) fail('Snapshot class mismatch');
	if (!['weapon', ...ACCESSORY_SLOTS, 'bracelet'].every(slot => snapshot.items?.some(item => item.slot === slot))) fail('Incomplete equipment snapshot');
	if (snapshot.arkGridCores?.length !== baseline.arkGrid.length) fail('Incomplete Ark Grid snapshot');
	const rawAccessoryDamage = (snapshot.items ?? []).filter(item => ACCESSORY_SLOTS.some(slot => slot === item.slot))
		.flatMap(item => item.data.stats ?? []).filter(s => s.type === 2 && s.index === 50).reduce((sum, s) => sum + s.value / 100, 0);
	const simulatedAccessoryDamage = ACCESSORY_SLOTS.flatMap(slot => baseline.accessories[slot] ?? [])
		.reduce((sum, line) => sum + (line.key === 'add_dmg' && 'tier' in line ? (ACCESSORY_LINES.find(l => l.key === 'add_dmg')!.values[line.tier] / 100) : 0), 0);
	if (Math.abs(rawAccessoryDamage - simulatedAccessoryDamage) > 1e-6) fail('Unsupported accessory Additional Damage roll');
	const rawAccessoryAttack = (snapshot.items ?? []).filter(item => ACCESSORY_SLOTS.some(slot => slot === item.slot))
		.flatMap(item => item.data.stats ?? []).filter(s => s.type === 2 && s.index === 49).reduce((sum, s) => sum + s.value / 100, 0);
	const simulatedAccessoryAttack = ACCESSORY_SLOTS.flatMap(slot => baseline.accessories[slot] ?? [])
		.reduce((sum, line) => sum + (line.key === 'atk_pct' && 'tier' in line ? (ACCESSORY_LINES.find(l => l.key === 'atk_pct')!.values[line.tier] / 100) : 0), 0);
	if (Math.abs(rawAccessoryAttack - simulatedAccessoryAttack) > 1e-6) attackKnown = false;
	for (const key of braceletEffects(baseline.bracelet)) {
		const part = braceletPart(key);
		if (!part || part.unvalued.some(text => /Additional Damage/.test(text))) fail('Unresolved bracelet Additional Damage');
		if (part?.unvalued.some(text => /Atk\. Power|Attack Power/.test(text))) attackKnown = false;
	}
	for (const [id, engraving] of Object.entries(baseline.engravings)) {
		const hasAdditional = ENGRAVING_ADDITIONAL_DAMAGE[engraving.as ?? Number(id)];
		if (hasAdditional !== false) fail('Engraving Additional Damage unresolved');
	}
	// LOA Logs also assumes this pet stat (PET_SKILL_DAMAGE_RATE). It is a baseline bucket, not a new gear gain.
	if (loadout.battlePoint.parts.some(p => p.type === PartType.PetSpecialty)) {
		additionalDamage += 1;
		assumptions.push('Pet Additional Damage +1%');
	} else fail('Pet Additional Damage unavailable');
	if (baseline.quality.weapon === undefined) fail('Weapon quality unavailable');
	if (snapshot.elixirs && (!Array.isArray(snapshot.elixirs) || snapshot.elixirs.length)) fail('Legacy elixir stats unresolved');
	if (snapshot.transcendences && (!Array.isArray(snapshot.transcendences) || snapshot.transcendences.length)) fail('Transcendence stats unresolved');
	const nodes = run.arkPassives;
	if (!nodes?.evolution || !snapshot.arkPassive?.evolution) fail('Matching Ark Passive nodes unavailable');
	const nodeKey = (list: {id: number; lv?: number; level?: number}[]) => list.map(n => `${n.id}:${n.lv ?? n.level}`).sort().join(',');
	for (const tree of ['evolution', 'enlightenment', 'leap']) {
		if (nodes?.[tree] && snapshot.arkPassive?.[tree] && nodeKey(nodes[tree]) !== nodeKey(snapshot.arkPassive[tree])) fail('Snapshot passives differ from the run');
	}
	for (const node of ['evolution', 'enlightenment', 'leap'].flatMap(tree => nodes?.[tree] ?? [])) {
		const definition = PASSIVE_DAMAGE_STATS[node.id], stats = definition?.levels[node.lv - 1];
		if (!stats) { fail(`Passive ${node.id} level unavailable`); continue; }
		additionalDamage += stats.filter(s => s.stat === 50).reduce((sum, s) => sum + s.value / 100, 0);
		attackPowerPct += stats.filter(s => s.stat === 49).reduce((sum, s) => sum + s.value / 100, 0);
		if (definition.unresolvedAttack) attackKnown = false;
		if (node.id === 1032200) {
			additionalDamage += MASTER_STATS.additionalDamage * MASTER_STATS.stacks;
			assumptions.push('Master at 5 stacks');
		}
	}
	if (!Array.isArray(snapshot.cards) || snapshot.cards.some(c => !c || !Number.isSafeInteger(c.id) || !Number.isInteger(c.level) || c.level < 0 || c.level > 5)
		|| new Set(snapshot.cards.map(c => c.id)).size !== snapshot.cards.length) fail('Equipped card set unavailable');
	else for (const set of CARD_DAMAGE_STATS) {
		const equipped = snapshot.cards.filter(c => set.cards.includes(c.id));
		const awakening = equipped.reduce((sum, c) => sum + c.level, 0);
		for (const effect of set.effects) if (equipped.length >= effect.count && awakening >= effect.levelSum) {
			additionalDamage += effect.stats.filter(s => s.stat === 50).reduce((sum, s) => sum + s.value / 100, 0);
			attackPowerPct += effect.stats.filter(s => s.stat === 49).reduce((sum, s) => sum + s.value / 100, 0);
		}
	}
	if (!Number.isFinite(additionalDamage) || additionalDamage < 0 || additionalDamage > 1000) fail('Invalid Additional Damage total');
	if (known) totals.additionalDamage = additionalDamage;
	if (known && attackKnown && Number.isFinite(attackPowerPct)) for (const skill of run.skills ?? []) {
		if (skill.hyper || isParadiseProc(skill.id) || !(skill.damage > 0)) continue;
		const windows = skill.statWindows;
		if (!windows?.length || windows.some(w => w.attackPowerPct === undefined || !(100 + attackPowerPct + w.attackPowerPct > 0))) continue;
		const covered = windows.reduce((sum, w) => sum + w.damage, 0);
		if (Math.abs(covered - skill.damage) > 1) continue;
		const coefficient = windows.reduce((sum, w) => sum + w.damage / (100 + attackPowerPct + w.attackPowerPct!), 0) / skill.damage;
		if (Number.isFinite(coefficient) && coefficient >= 0 && coefficient <= 1) skills[skill.id] = {attackPowerPct: coefficient};
	}
	missing.push('Root attack stats and support contribution unresolved', 'Crit totals and conversion distribution unresolved', 'Evolution totals require the run’s efficiency record');
	return { totals, missing: [...new Set(missing)], assumptions, skills };
}
