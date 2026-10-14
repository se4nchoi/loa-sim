// Turns one logged run into the compact summary the DPS tab keeps in browser storage. Pure, so it can be tested
// without a database; the worker supplies the decoded columns.

import type { EncounterRow, RunSkill, RunSummary } from './protocol';
import { averageStatValues, splitOf } from './stat-values';

export interface LoggedRunSkill {
	id?: number; name?: string; icon?: string;
	totalDamage?: number; total_damage?: number; critDamage?: number;
	hits?: number; crits?: number; casts?: number; timeAvailable?: number;
	gemDamage?: number; gemCooldown?: number;
}

export interface LoggedEntity {
	skills: Record<string, LoggedRunSkill>;
	combatPower?: unknown;
	itemLevel?: unknown;
	spec?: unknown;
	engravings?: unknown;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** null when the player dealt no skill damage in the run. */
export function runSummary(row: EncounterRow, entity: LoggedEntity, misc: unknown, names: Record<number, [string, string]>): RunSummary | null {
	const skills: RunSkill[] = [];
	for (const [key, s] of Object.entries(entity.skills)) {
		const id = Number(s.id ?? key);
		const damage = Number(s.totalDamage ?? s.total_damage ?? 0);
		if (!Number.isFinite(id) || !(damage > 0)) continue;
		names[id] ??= [s.name ?? `Skill ${id}`, (s.icon ?? '').replace(/\.png$/i, '')];
		skills.push({
			id, damage, critDamage: num(s.critDamage) ?? 0, hits: num(s.hits) ?? 0, crits: num(s.crits) ?? 0, casts: num(s.casts) ?? 0,
			...(num(s.timeAvailable) !== null ? { timeAvailable: s.timeAvailable } : {}),
			...(num(s.gemDamage) !== null ? { damageGem: s.gemDamage } : {}),
			...(num(s.gemCooldown) !== null ? { cooldownGem: s.gemCooldown } : {})
		});
	}
	if (!skills.length) return null;
	let engravings: unknown = entity.engravings;
	try { if (typeof engravings === 'string') engravings = JSON.parse(engravings); } catch { engravings = null; }
	const split = splitOf(misc, row.player);
	const thorn = (split as { bluntThornEfficiency?: { damageDoneByStat?: number } } | null)?.bluntThornEfficiency?.damageDoneByStat ?? 0;
	const version = (misc as { version?: unknown } | null)?.version;
	return {
		...row,
		combatPower: num(entity.combatPower),
		itemLevel: num(entity.itemLevel),
		spec: typeof entity.spec === 'string' && entity.spec ? entity.spec : null,
		engravings: Array.isArray(engravings) ? engravings.filter((e): e is string => typeof e === 'string') : [],
		damage: skills.reduce((sum, s) => sum + s.damage, 0),
		skills: skills.sort((a, b) => b.damage - a.damage),
		statValues: averageStatValues([split]),
		critConversion: thorn > 0,
		meterVersion: typeof version === 'string' ? version : null
	};
}
