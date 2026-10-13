import type { EncounterRow, ReplayRun, ReplayHit, ReplaySkill } from './protocol';

type LoggedHit = { damage?: number; crit?: boolean; timestamp?: number; buffedBy?: number[]; debuffedBy?: number[] };
export interface LoggedReplaySkill {
	id?: number; name?: string; totalDamage?: number; total_damage?: number;
	hits?: number; crits?: number; gemDamage?: number; gemCooldown?: number;
	isHyperAwakening?: boolean;
	skillCastLog?: { hits?: LoggedHit[] }[];
}

/** Keep only what the experiment needs; no buff tables or meter source code are redistributed. */
export function replayRun(row: EncounterRow, skills: Record<string, LoggedReplaySkill>, misc: unknown,
	combatPower: unknown = null, loadoutHash: unknown = null, buildSpec?: unknown, arkPassives?: unknown, buffMetadata?: unknown): ReplayRun {
	const hits: ReplayHit[] = [];
	const list: ReplaySkill[] = [];
	for (const [key, s] of Object.entries(skills)) {
		const id = Number(s.id ?? key);
		const totalDamage = Number(s.totalDamage ?? s.total_damage ?? 0);
		if (!Number.isFinite(id) || !Number.isFinite(totalDamage) || totalDamage <= 0) continue;
		list.push({ id, name: s.name ?? `Skill ${id}`, totalDamage, hits: s.hits ?? 0, crits: s.crits ?? 0,
			damageGem: s.gemDamage, cooldownGem: s.gemCooldown });
		for (const cast of s.skillCastLog ?? []) for (const h of cast.hits ?? [])
			if (typeof h.damage === 'number' && Number.isFinite(h.damage) && h.damage > 0 && typeof h.crit === 'boolean')
				hits.push({ skill: id, damage: h.damage, crit: h.crit, hyper: s.isHyperAwakening === true,
					...(typeof h.timestamp === 'number' && Number.isFinite(h.timestamp) ? {timestamp:h.timestamp} : {}),
					...(Array.isArray(h.buffedBy) ? {buffedBy:h.buffedBy.filter(n => Number.isSafeInteger(n) && n >= 0)} : {}),
					...(Array.isArray(h.debuffedBy) ? {debuffedBy:h.debuffedBy.filter(n => Number.isSafeInteger(n) && n >= 0)} : {}) });
	}
	const split = (misc as { contributionSplits?: { name?: string; damageDoneWithAllCrits?: number; damageDoneWithoutCrits?: number; bluntThornEfficiency?: {damageDoneByStat?:number} }[] } | null)
		?.contributionSplits?.find(s => s.name?.toLowerCase() === row.player.toLowerCase());
	const ratio = split?.damageDoneWithoutCrits && split.damageDoneWithAllCrits ? split.damageDoneWithAllCrits / split.damageDoneWithoutCrits : null;
	const passives: Record<string,{id:number;lv:number}[]> = {};
	let decoded: unknown = arkPassives;
	try { if (typeof arkPassives === 'string') decoded = JSON.parse(arkPassives); } catch { decoded = null; }
	if (decoded && typeof decoded === 'object') for (const [tree,nodes] of Object.entries(decoded))
		if (Array.isArray(nodes)) passives[tree] = nodes.filter(n => n && Number.isSafeInteger(n.id) && Number.isInteger(n.lv) && n.lv > 0).map(n => ({id:n.id,lv:n.lv}));
	const buffSources: NonNullable<ReplayRun['buffSources']> = {};
	if (buffMetadata && typeof buffMetadata === 'object') for (const [id,value] of Object.entries(buffMetadata)) {
		if (!Number.isSafeInteger(Number(id)) || !value || typeof value !== 'object') continue;
		const data = value as {uniqueGroup?:unknown;source?:{name?:unknown;skill?:{id?:unknown}}};
		const source = data.source;
		buffSources[Number(id)] = {
			...(Number.isSafeInteger(source?.skill?.id) ? {skill:Number(source!.skill!.id)} : {}),
			...(typeof source?.name === 'string' ? {name:source.name} : {}),
			...(Number.isSafeInteger(data.uniqueGroup) ? {uniqueGroup:Number(data.uniqueGroup)} : {})
		};
	}
	return { ...row, combatPower: typeof combatPower === 'number' && Number.isFinite(combatPower) ? combatPower : null,
		loadoutHash: typeof loadoutHash === 'string' && loadoutHash ? loadoutHash : null,
		totalDamage: list.reduce((sum,s) => sum + s.totalDamage,0), hits, skills: list,
		effectiveCritMultiplier: ratio && Number.isFinite(ratio) && ratio >= 1 ? ratio : null,
		critConversion: (split?.bluntThornEfficiency?.damageDoneByStat ?? 0) > 0,
		...(typeof buildSpec === 'string' && buildSpec ? {buildSpec} : {}),
		...(Object.keys(passives).length ? {arkPassives:passives} : {}),
		...(Object.keys(buffSources).length ? {buffSources} : {}),
		...(typeof (misc as {version?:unknown} | null)?.version === 'string' ? {meterVersion:(misc as {version:string}).version} : {}) };
}
