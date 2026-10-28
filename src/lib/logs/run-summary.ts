// Turns one logged run into the compact summary the DPS tab keeps in browser storage. Pure, so it can be tested
// without a database; the worker supplies the decoded columns.

import type { EncounterRow, RunSkill, RunSummary, SupportKind, SupportRun, SupportUptime } from './protocol';
import { averageStatValues, splitOf } from './stat-values';
import { combatStatWindows, type StatWindowHit } from './combat-stat-windows';
import { evolutionValue } from './evolution-value';
import { stackReplay } from './stack-replay';

export interface LoggedRunSkill {
	id?: number; name?: string; icon?: string;
	totalDamage?: number; total_damage?: number; critDamage?: number;
	hits?: number; crits?: number; casts?: number; timeAvailable?: number;
	gemDamage?: number; gemCooldown?: number;
	isHyperAwakening?: boolean;
	/** Damage dealt under each buff, by buff id. */
	buffedBy?: Record<string, number>;
	frontAttackDamage?: number; backAttackDamage?: number;
	skillCastLog?: {timestamp?: number; hits?: (StatWindowHit & {timestamp?: number})[]}[];
}

export interface LoggedEntity {
	skills: Record<string, LoggedRunSkill>;
	combatPower?: unknown;
	itemLevel?: unknown;
	spec?: unknown;
	engravings?: unknown;
	arkPassiveData?: unknown;
	loadoutHash?: unknown;
	/** The encounter's Ark Grid and identity buffs by id, with their names; their damage per skill is kept. */
	keptBuffs?: Map<number, string>;
	/** The fight's boss HP at the end and all players' damage, when the import read them. */
	bossHp?: { left: number; max: number };
	partyDamage?: number;
	dead?: { count: number; of: number };
	/** The run's id on lostark.bible when LOA Logs synced it (its sync_logs table). */
	upstreamId?: unknown;
	/** A support's contribution (supportRunOf). */
	support?: SupportRun | null;
	/** Observed buff id → source skill id, to resolve meter-composed buff identifiers. */
	statBuffSources?: Record<number, number>;
}

/** The LOA Logs effect type a support buff works through ("attack_power_addend_/$@[16,314184]") → what scales it. */
export function supportKindOf(effect: string): SupportKind {
	if (effect.startsWith('attack_power_addend')) return 'attack';
	if (effect.startsWith('skill_damage_sub_rate') || effect.startsWith('ultimate_awakening_damage_rate')) return 'damage';
	if (effect.startsWith('skill_damage_amplify')) return 'brand';
	return 'other';
}

const noKinds = (): Record<SupportKind, number> => ({ attack: 0, damage: 0, brand: 0, other: 0 });

/**
 * A support's contribution from the encounter's misc: for each dealer (LOA Logs' contribution splits), the damage it
 * credits to the support, split by kind in proportion to its per-effect increases (they overlap, so they're weights,
 * not amounts). null without splits (old logs) or when no dealer credits the support.
 */
export function supportRunOf(misc: unknown, player: string, classOf: (name: string) => string | undefined, uptime?: SupportUptime,
	more: { skillOf?: (buffId: number) => string | undefined; uptimeOf?: (name: string) => SupportUptime | undefined } = {}): SupportRun | null {
	const splits = (misc as { contributionSplits?: Record<string, unknown> } | null)?.contributionSplits;
	if (!splits || typeof splits !== 'object') return null;
	const dealers: SupportRun['dealers'] = [];
	const sources: NonNullable<SupportRun['sources']> = {};
	for (const raw of Object.values(splits)) {
		const v = raw as { name?: string; partyNumber?: number; damageSplitByName?: Record<string, number>; damageIncreaseByEntitySkillGroup?: Record<string, Record<string, number>> };
		if (!v?.name || v.name === player || !((v.partyNumber ?? -1) >= 0)) continue;
		const given = num(v.damageSplitByName?.[player]) ?? 0;
		if (!(given > 0)) continue;
		// Each effect names its buff ("attack_power_addend_/$@[16,314184]": buff 314184); its increase is that buff's weight.
		const weights = noKinds();
		const byBuff: Record<number, number> = {};
		for (const [effect, x] of Object.entries(v.damageIncreaseByEntitySkillGroup?.[player] ?? {})) {
			if (!num(x) || !(x > 0)) continue;
			const kind = supportKindOf(effect);
			weights[kind] += x;
			const id = Number([...effect.matchAll(/\[16,(\d+)\]/g)].at(-1)?.[1]);
			if (!Number.isFinite(id)) continue;
			byBuff[id] = (byBuff[id] ?? 0) + x;
			sources[id] ??= { kind, ...(more.skillOf?.(id) ? { skill: more.skillOf(id) } : {}) };
		}
		const total = weights.attack + weights.damage + weights.brand + weights.other;
		const kinds = noKinds();
		if (total > 0) for (const k of Object.keys(kinds) as SupportKind[]) kinds[k] = (given * weights[k]) / total;
		else kinds.other = given;
		const buffs = total > 0 ? Object.fromEntries(Object.entries(byBuff).map(([id, x]) => [id, (given * x) / total])) : undefined;
		const damage = Object.values(v.damageSplitByName ?? {}).reduce((sum, x) => sum + (num(x) ?? 0), 0);
		const dealerUptime = more.uptimeOf?.(v.name);
		dealers.push({ cls: classOf(v.name) ?? '', damage, kinds, ...(buffs ? { buffs } : {}), ...(dealerUptime ? { uptime: dealerUptime } : {}) });
	}
	if (!dealers.length) return null;
	const kinds = noKinds();
	for (const d of dealers) for (const k of Object.keys(kinds) as SupportKind[]) kinds[k] += d.kinds[k];
	return { kinds, dealers, ...(Object.keys(sources).length ? { sources } : {}), ...(uptime ? { uptime } : {}) };
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The skill's damage under the kept buffs; nothing when the import didn't read the buffs. */
function buffsOf(s: LoggedRunSkill, kept: Map<number, string> | undefined): { buffs?: Record<number, number> } {
	if (!kept) return {};
	const out: Record<number, number> = {};
	for (const [id, damage] of Object.entries(s.buffedBy ?? {})) if (kept.has(Number(id)) && num(damage)) out[Number(id)] = damage;
	return { buffs: out };
}

/** null when the player dealt no skill damage in the run. */
export function runSummary(row: EncounterRow, entity: LoggedEntity, misc: unknown, names: Record<number, [string, string]>): RunSummary | null {
	const skills: RunSkill[] = [];
	for (const [key, s] of Object.entries(entity.skills)) {
		const id = Number(s.id ?? key);
		const damage = Number(s.totalDamage ?? s.total_damage ?? 0);
		if (!Number.isFinite(id) || !(damage > 0)) continue;
		names[id] ??= [s.name ?? `Skill ${id}`, (s.icon ?? '').replace(/\.png$/i, '')];
		const statWindows = combatStatWindows(s.skillCastLog, damage, num(s.critDamage) ?? 0, entity.statBuffSources);
		skills.push({
			id, damage, critDamage: num(s.critDamage) ?? 0, hits: num(s.hits) ?? 0, crits: num(s.crits) ?? 0, casts: num(s.casts) ?? 0,
			...(s.isHyperAwakening === true ? {hyper: true} : {}),
			...(num(s.timeAvailable) !== null ? { timeAvailable: s.timeAvailable } : {}),
			...(num(s.gemDamage) !== null ? { damageGem: s.gemDamage } : {}),
			...(num(s.gemCooldown) !== null ? { cooldownGem: s.gemCooldown } : {}),
			...buffsOf(s, entity.keptBuffs),
			...(num(s.frontAttackDamage) !== null ? { front: s.frontAttackDamage } : {}),
			...(num(s.backAttackDamage) !== null ? { back: s.backAttackDamage } : {}),
			...(statWindows ? {statWindows} : {})
		});
	}
	if (!skills.length) return null;
	const stackDamage = entity.keptBuffs ? stackReplay(Object.entries(entity.skills).map(([key, s]) => ({ id: Number(s.id ?? key), name: s.name ?? '', casts: s.skillCastLog ?? [] })), entity.keptBuffs) : undefined;
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
	const evoValue = evolutionValue(split, arkPassives.evolution, skills.filter(skill => !skill.hyper && !(skill.id >= 170_000_000 && skill.id < 172_000_000)).reduce((sum, skill) => sum + skill.damage, 0));
	// The listing's snapshot hash; the entity's own is kept below.
	const { loadoutHash: _listed, ...listed } = row;
	return {
		...listed,
		combatPower: num(entity.combatPower),
		itemLevel: num(entity.itemLevel),
		spec: typeof entity.spec === 'string' && entity.spec ? entity.spec : null,
		engravings: Array.isArray(engravings) ? engravings.filter((e): e is string => typeof e === 'string') : [],
		...(Object.keys(arkPassives).length ? { arkPassives } : {}),
		...(Object.keys(arkGridOrder).length ? { arkGridOrder } : {}),
		...(typeof entity.loadoutHash === 'string' && entity.loadoutHash ? { loadoutHash: entity.loadoutHash } : {}),
		...(entity.keptBuffs ? { buffNames: Object.fromEntries(entity.keptBuffs) } : {}),
		...(stackDamage ? { stackDamage } : {}),
		...(entity.bossHp && entity.bossHp.max > 0 ? { bossHp: entity.bossHp } : {}),
		...(entity.partyDamage && entity.partyDamage > 0 ? { partyDamage: entity.partyDamage } : {}),
		...(entity.dead ? { dead: entity.dead } : {}),
		...(entity.support ? { support: entity.support } : {}),
		...(typeof entity.upstreamId === 'string' && /^[A-Za-z0-9_-]{4,32}$/.test(entity.upstreamId) ? { upstreamId: entity.upstreamId } : {}),
		damage: skills.reduce((sum, s) => sum + s.damage, 0),
		skills: skills.sort((a, b) => b.damage - a.damage),
		statValues: averageStatValues([split]),
		...(evoValue !== undefined ? {evolutionDamageValue: evoValue} : {}),
		critConversion: thorn > 0,
		meterVersion: typeof version === 'string' ? version : null
	};
}
