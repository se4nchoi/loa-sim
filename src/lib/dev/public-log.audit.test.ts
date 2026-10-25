// Dev-only audit of one player's run in one public lostark.bible log, for classes this machine's logs don't cover. With
// the dev server running:
//   LOG=91Vm5pv PLAYER=Shanzkii npx vitest run src/lib/dev/public-log.audit.test.ts
// One request for that log (the link the player gave; kept in cache/ after), then the character and the run's gear
// snapshot through the app's own API, as loading them in the app does. Builds the run as an encounters.db import would
// and reports what the meter counts, leaves out and notes. Writes cache/public-log-<log>-<player>.txt. Skipped unless
// LOG and PLAYER are set.
import { it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { unflatten, type CharacterData, type ClearSnapshot } from '$lib/bible-data';
import type { EncounterRow } from '$lib/logs/protocol';
import { runSummary, supportRunOf } from '$lib/logs/run-summary';
import { activeEffects, buffMatches, orderCoreEffect } from '$lib/upgrade-planner/ark-grid-dps';
import { clearState } from '$lib/upgrade-planner/clear-state';
import { isParadiseProc } from '$lib/upgrade-planner/dealer-grid-stats';
import { dpsMeter, meterGain } from '$lib/upgrade-planner/dps-meter';
import { GEM_SKILLS } from '$lib/upgrade-planner/game-data';
import { ORDER_CORES } from '$lib/upgrade-planner/order-cores';
import { initSimState, simCorePoints, type SimState } from '$lib/upgrade-planner/simulate';
import { SKILL_GROUPS } from '$lib/upgrade-planner/skill-groups';
import { supportGain, supportMeter } from '$lib/upgrade-planner/support-meter';

const LOG = process.env.LOG, PLAYER = process.env.PLAYER, REGION = process.env.REGION ?? 'NA';
const DEV = process.env.DEV_SERVER ?? 'http://localhost:5173';
const SUPPORTS = new Set(['Bard', 'Paladin', 'Artist', 'Valkyrie']);

type Buff = { buffCategory?: string; target?: string; source?: { name?: string; skill?: { name?: string } | null } };
type Entity = Record<string, unknown> & { name: string; class: string; entityType: string; skills: Record<string, Record<string, unknown>>; damageStats?: Record<string, number>; loadoutHash?: string };

const pct = (x: number | null | undefined) => (x === null || x === undefined ? 'not valued' : `${x >= 0 ? '+' : ''}${x.toFixed(2)}%`);

it.skipIf(!LOG || !PLAYER)('public log audit', { timeout: 120_000 }, async () => {
	const file = `cache/public-log-${LOG}.json`;
	if (!existsSync(file)) {
		const res = await fetch(`https://lostark.bible/logs/${LOG}/__data.json`, { headers: { 'user-agent': 'loa-sim DPS sim check (one log a player linked)' } });
		if (!res.ok) throw new Error(`log ${LOG}: ${res.status}`);
		writeFileSync(file, await res.text());
	}
	const nodes = (JSON.parse(readFileSync(file, 'utf8')) as { nodes: ({ data?: unknown[] } | null)[] }).nodes;
	const page = nodes.map((n) => (n?.data ? (unflatten(n.data) as Record<string, unknown>) : null)).find((p) => p?.encounterInfo) as { encounterInfo: { encounter: Record<string, unknown> } };
	const enc = page.encounterInfo.encounter as { entityList: Entity[] | Record<string, Entity>; fightStart: number; currentBossName: string; difficulty?: string; duration: number; encounterDamageStats: { buffs?: Record<string, Buff>; debuffs?: Record<string, Buff>; misc?: Record<string, unknown> } };
	const players = (Array.isArray(enc.entityList) ? enc.entityList : Object.values(enc.entityList)).filter((e) => e.entityType === 'PLAYER');
	const e = players.find((p) => p.name.toLowerCase() === PLAYER!.toLowerCase());
	if (!e) throw new Error(`${PLAYER} isn't in log ${LOG}: ${players.map((p) => p.name).join(', ')}`);
	const stats = enc.encounterDamageStats, misc = stats.misc ?? null;

	// As the import reads it (logs-worker runSummaries).
	const buffs = { ...(stats.buffs ?? {}) };
	const keep = (b: Buff) => b?.buffCategory === 'arkgrid' || b?.buffCategory === 'identity' || ((b?.buffCategory === 'classskill' || b?.buffCategory === 'arkpassive') && b.target !== 'PARTY');
	const keptBuffs = new Map(Object.entries(buffs).filter(([, b]) => keep(b)).map(([id, b]) => [Number(id), b.source?.name ?? '']));
	let support = null;
	if (SUPPORTS.has(e.class)) {
		const classes = new Map(players.map((p) => [p.name, p.class]));
		const of = (d: Record<string, number> | undefined, k: string) => (d && d.damageDealt > 0 ? Math.min(1, Math.max(0, (d[k] ?? 0) / d.damageDealt)) : 0);
		const uptimes = new Map(players.filter((p) => p.damageStats?.damageDealt).map((p) => [p.name, { attack: of(p.damageStats, 'buffedBySupport'), brand: of(p.damageStats, 'debuffedBySupport'), identity: of(p.damageStats, 'buffedByIdentity'), hyper: of(p.damageStats, 'buffedByHat') }]));
		const skills = new Map<number, string>();
		for (const table of [stats.buffs, stats.debuffs]) for (const [id, b] of Object.entries(table ?? {})) if (b?.source?.skill?.name) skills.set(Number(id), b.source.skill.name);
		support = supportRunOf(misc, e.name, (n) => classes.get(n), undefined, { skillOf: (id) => skills.get(id), uptimeOf: (n) => uptimes.get(n) });
	}
	const row = { id: 0, start: enc.fightStart, boss: enc.currentBossName, difficulty: enc.difficulty ?? '', cleared: (misc?.raidClear as boolean | undefined) ?? null, player: e.name, duration: enc.duration } as EncounterRow;
	const names: Record<number, [string, string]> = {};
	const run = runSummary(row, { skills: e.skills as never, combatPower: e.combatPower, itemLevel: e.gearScore, spec: e.spec, arkPassiveData: e.arkPassiveData, loadoutHash: e.loadoutHash, keptBuffs, support }, misc, names);
	if (!run) throw new Error('no skill damage');

	// The character (one, as the app loads it) and the run's gear.
	const char = (await (await fetch(`${DEV}/api/character/${REGION}/${encodeURIComponent(e.name)}`)).json()) as CharacterData;
	const loadout = char.loadout!;
	const snap = (await (await fetch(`${DEV}/api/snapshot/${e.loadoutHash}`)).json()) as ClearSnapshot;
	const setup = clearState(loadout, snap, run.skills), base = setup.state, now = initSimState(loadout);
	const isSupport = !!loadout.battlePoint.isSupport;
	const cls = Object.values(ORDER_CORES).find((c) => base.arkGrid.some((g) => ORDER_CORES[g.as ?? g.id] === c))?.cls ?? '';

	const out: string[] = [`${e.name} · ${e.class} (${cls}) · ${run.boss} ${run.difficulty} · ${Math.round(run.duration / 1000)}s · ${isSupport ? 'support' : 'dealer'}`];
	out.push(`gear snapshot: ${setup.notes.length ? setup.notes.join(' / ') : 'read'}; LOA Logs stat values: ${run.statValues ? 'yes' : 'no'}${isSupport ? `; support split: ${run.support ? `${run.support.dealers.length} dealers` : 'none'}` : ''}`);
	const dmg = run.skills.reduce((s, k) => s + k.damage, 0);
	const share = (f: (id: number) => boolean) => ((100 * run.skills.filter((k) => f(k.id)).reduce((s, k) => s + k.damage, 0)) / dmg).toFixed(1);
	out.push(`skills: ${share((id) => !!SKILL_GROUPS[cls]?.[id])}% of damage in a skill group, ${share((id) => !!GEM_SKILLS[id])}% on gem skills`);
	out.push(`unknown skills: ${run.skills.filter((k) => !SKILL_GROUPS[cls]?.[k.id] && !GEM_SKILLS[k.id] && !isParadiseProc(k.id) && k.damage / dmg > 0.005).map((k) => `${names[k.id]?.[0]}#${k.id} ${((100 * k.damage) / dmg).toFixed(1)}%`).join(', ') || 'none over 0.5%'}`);

	// The run's own setup → the current gear, as DPS mode shows it by default.
	const meter = isSupport ? supportMeter(loadout, base, now, run) : dpsMeter(loadout, base, now, [run], [run], orderCoreEffect);
	out.push(`run setup → current gear: ${meter ? `${pct((meter.after / meter.before - 1) * 100)}` : 'no meter'}`);
	for (const x of meter?.notInMeter ?? []) out.push(`  not counted: ${x}`);
	for (const x of (meter && 'notes' in meter ? (meter.notes as string[]) : [])) out.push(`  note: ${x}`);

	// One-step edits on the run's own setup: each should have a number.
	const gain = (to: SimState) => (isSupport ? supportGain(loadout, base, base, to, run) : meterGain(loadout, base, base, to, [run], [run], orderCoreEffect).gainPct);
	const probe = (label: string, edit: (s: SimState) => boolean) => { const s = structuredClone(base); if (edit(s)) out.push(`  ${label}: ${pct(gain(s))}`); };
	out.push('one-step edits on the run setup:');
	probe('weapon honing +1', (s) => !!s.gear.weapon && (s.gear.weapon.honing += 1) > 0);
	for (const kind of ['damage', 'cooldown'] as const) {
		const i = base.gems.findIndex((g) => g.kind === kind && g.skill !== null && g.level < 10);
		if (i >= 0) probe(`${kind} gem ${GEM_SKILLS[base.gems[i].skill!]?.[0]} ${base.gems[i].level} → ${base.gems[i].level + 1}`, (s) => (s.gems[i].level += 1) > 0);
	}
	for (const [id, en] of Object.entries(base.engravings)) if (en.stone < 4) { probe(`engraving ${id} stone +1`, (s) => (s.engravings[Number(id)].stone += 1) > 0); break; }
	probe('Leap Karma +1', (s) => s.karma.leap !== null && s.karma.leap < 30 && (s.karma.leap += 1) > 0);

	// Order cores: the states and Destiny buffs their effects need, found in the run or not.
	const anchor = initSimState(loadout);
	out.push('order cores:');
	for (const core of base.arkGrid) {
		const id = core.as ?? core.id, info = ORDER_CORES[id];
		if (!info) continue;
		const fx = activeEffects(id, simCorePoints(loadout, base, anchor, core.id));
		const wheres = [...fx.effects.keys()].map((k) => k.slice(0, k.lastIndexOf('#'))).filter((w) => w.startsWith('state:'));
		const found = (w: string) => Object.values(run.buffNames ?? {}).some((n) => buffMatches(n, w.slice(6)) || (w.startsWith('state:Destiny: ') && n.startsWith(`${w.slice(6)} `)));
		out.push(`  ${info.name}: ${fx.effects.size} valued place(s)${wheres.length ? `; needs ${[...new Set(wheres)].map((w) => `${w.slice(6)} ${found(w) ? '✓' : '✗ not in the run'}`).join(', ')}` : ''}${fx.other.length ? `; text: ${fx.other.length}` : ''}`);
	}

	const report = out.join('\n');
	writeFileSync(`cache/public-log-${LOG}-${e.name}.txt`, report);
	console.log(report);
});
