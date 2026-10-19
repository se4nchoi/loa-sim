// Turns one logged run into the compact summary the DPS tab keeps in browser storage. Pure, so it can be tested
// without a database; the worker supplies the decoded columns.

import type { EncounterRow, RunSkill, RunSummary } from './protocol';
import { averageStatValues, splitOf } from './stat-values';

export interface LoggedRunSkill {
	id?: number; name?: string; icon?: string;
	totalDamage?: number; total_damage?: number; critDamage?: number;
	hits?: number; crits?: number; casts?: number; timeAvailable?: number;
	gemDamage?: number; gemCooldown?: number;
	/** Damage dealt under each buff, by buff id. */
	buffedBy?: Record<string, number>;
}

export interface LoggedEntity {
	skills: Record<string, LoggedRunSkill>;
	combatPower?: unknown;
	itemLevel?: unknown;
	spec?: unknown;
	engravings?: unknown;
	arkPassiveData?: unknown;
	loadoutHash?: unknown;
	/** Buff ids the encounter lists as Ark Grid buffs; their damage per skill is kept. */
	arkGridBuffs?: Set<number>;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The skill's damage under the encounter's Ark Grid buffs; nothing when the import didn't read the buffs. */
function arkGridOf(s: LoggedRunSkill, buffs: Set<number> | undefined): { arkGrid?: Record<number, number> } {
	if (!buffs) return {};
	const out: Record<number, number> = {};
	for (const [id, damage] of Object.entries(s.buffedBy ?? {})) if (buffs.has(Number(id)) && num(damage)) out[Number(id)] = damage;
	return { arkGrid: out };
}

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
			...(num(s.gemCooldown) !== null ? { cooldownGem: s.gemCooldown } : {}),
			...arkGridOf(s, entity.arkGridBuffs)
		});
	}
	if (!skills.length) return null;
	let engravings: unknown = entity.engravings;
	try { if (typeof engravings === 'string') engravings = JSON.parse(engravings); } catch { engravings = null; }
	let passiveData: unknown = entity.arkPassiveData;
	try { if (typeof passiveData === 'string') passiveData = JSON.parse(passiveData); } catch { passiveData = null; }
	const arkPassives: Record<string, { id: number; lv: number }[]> = {};
	const arkGridOrder: NonNullable<RunSummary['arkGridOrder']> = {};
	if (passiveData && typeof passiveData === 'object') {
		const data = passiveData as Record<string, unknown>;
		for (const tree of ['evolution', 'enlightenment', 'leap']) {
			const nodes = data[tree];
			if (Array.isArray(nodes)) arkPassives[tree] = nodes.filter(n => n && Number.isSafeInteger(n.id) && Number.isInteger(n.lv) && n.lv > 0).map(n => ({ id: n.id, lv: n.lv }));
		}
		if (data.arkGridOrder && typeof data.arkGridOrder === 'object') {
			const order = data.arkGridOrder as Record<string, unknown>;
			for (const shape of ['sun', 'moon', 'star'] as const) {
				const value = order[shape];
				if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) arkGridOrder[shape] = value;
			}
		}
	}
	const split = splitOf(misc, row.player);
	const thorn = (split as { bluntThornEfficiency?: { damageDoneByStat?: number } } | null)?.bluntThornEfficiency?.damageDoneByStat ?? 0;
	const version = (misc as { version?: unknown } | null)?.version;
	return {
		...row,
		combatPower: num(entity.combatPower),
		itemLevel: num(entity.itemLevel),
		spec: typeof entity.spec === 'string' && entity.spec ? entity.spec : null,
		engravings: Array.isArray(engravings) ? engravings.filter((e): e is string => typeof e === 'string') : [],
		...(Object.keys(arkPassives).length ? { arkPassives } : {}),
		...(Object.keys(arkGridOrder).length ? { arkGridOrder } : {}),
		...(typeof entity.loadoutHash === 'string' && entity.loadoutHash ? { loadoutHash: entity.loadoutHash } : {}),
		damage: skills.reduce((sum, s) => sum + s.damage, 0),
		skills: skills.sort((a, b) => b.damage - a.damage),
		statValues: averageStatValues([split]),
		critConversion: thorn > 0,
		meterVersion: typeof version === 'string' ? version : null
	};
}
