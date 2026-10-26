/// <reference lib="webworker" />
// Reads a LOA Logs database (encounters.db) the player picked, entirely in the browser.
// SQLite runs in WebAssembly with a read-only VFS that pulls only the pages it needs straight from the File,
// so multi-GB databases open instantly without being copied into memory. Nothing leaves the machine.

import * as SQLite from 'wa-sqlite';
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import wasmUrl from 'wa-sqlite/dist/wa-sqlite.wasm?url';
import * as VFS from 'wa-sqlite/src/VFS.js';
import type { LogsRequest, LogsResponse, SkillShare, EncounterRow, StatValues, ReplayRun, RunGear } from './protocol';
import { averageStatValues, splitOf } from './stat-values';
import { replayRun, type LoggedReplaySkill } from './replay-data';
import { runSummary, supportRunOf, type LoggedRunSkill } from './run-summary';

/** LOA Logs' support classes: their runs also record what their buffs added to the party. */
const SUPPORT_CLASSES = new Set(['Bard', 'Paladin', 'Artist', 'Valkyrie']);

const DB_NAME = 'encounters.db';
/** wa-sqlite hands the VFS the name with any URI query ("encounters.db?immutable=1"); compare the bare name. */
const isDb = (name: string | null | undefined) => (name ?? '').split('?')[0].split('/').pop() === DB_NAME;

/** Read-only VFS over a File: reads are synchronous slices (FileReaderSync is available in workers). */
class FileVFS extends VFS.Base {
	name = 'file-readonly';
	file: File | null = null;
	private open = new Map<number, File>();
	private reader = new FileReaderSync();

	xOpen(name: string | null, fileId: number, _flags: number, pOutFlags: DataView): number {
		if (!this.file || !isDb(name)) return VFS.SQLITE_CANTOPEN;
		this.open.set(fileId, this.file);
		pOutFlags.setInt32(0, VFS.SQLITE_OPEN_READONLY, true);
		return VFS.SQLITE_OK;
	}
	xClose(fileId: number): number {
		this.open.delete(fileId);
		return VFS.SQLITE_OK;
	}
	// wa-sqlite passes a Uint8Array view at runtime (see its MemoryVFS example); its bundled .d.ts is stale.
	xRead(fileId: number, buffer: { size: number; value: Uint8Array }, iOffset: number): number {
		const pData = buffer as unknown as Uint8Array;
		const file = this.open.get(fileId);
		if (!file) return VFS.SQLITE_IOERR;
		const end = Math.min(iOffset + pData.byteLength, file.size);
		const got = iOffset < end ? new Uint8Array(this.reader.readAsArrayBuffer(file.slice(iOffset, end))) : new Uint8Array();
		pData.set(got);
		if (got.byteLength < pData.byteLength) {
			pData.fill(0, got.byteLength);
			return VFS.SQLITE_IOERR_SHORT_READ;
		}
		return VFS.SQLITE_OK;
	}
	xWrite(): number {
		return VFS.SQLITE_READONLY;
	}
	xTruncate(): number {
		return VFS.SQLITE_READONLY;
	}
	xFileSize(fileId: number, pSize64: DataView): number {
		const file = this.open.get(fileId);
		if (!file) return VFS.SQLITE_IOERR;
		pSize64.setBigInt64(0, BigInt(file.size), true);
		return VFS.SQLITE_OK;
	}
	xAccess(name: string, _flags: number, pResOut: DataView): number {
		// Only the main file exists: no journal / WAL, so SQLite reads it as-is.
		pResOut.setInt32(0, isDb(name) ? 1 : 0, true);
		return VFS.SQLITE_OK;
	}
	xDelete(): number {
		return VFS.SQLITE_READONLY;
	}
}

let sqlite3: SQLiteAPI | null = null;
let db: number | null = null;
const vfs = new FileVFS();

type SQLiteAPI = ReturnType<typeof SQLite.Factory>;

async function openDb(file: File) {
	if (!sqlite3) {
		const module = await SQLiteESMFactory({ locateFile: () => wasmUrl });
		sqlite3 = SQLite.Factory(module);
		// The VFS base class and the SQLiteVFS interface ship with conflicting xRead types; they match at runtime.
		sqlite3.vfs_register(vfs as unknown as Parameters<SQLiteAPI['vfs_register']>[0], false);
	}
	if (db !== null) await sqlite3.close(db);
	vfs.file = file;
	// immutable=1: never look for a journal/WAL and never lock. Close LOA Logs first so the file is complete.
	db = await sqlite3.open_v2(`file:${DB_NAME}?immutable=1`, SQLite.SQLITE_OPEN_READONLY | SQLite.SQLITE_OPEN_URI, vfs.name);
}

async function query(sql: string, params: (string | number)[] = []): Promise<Record<string, unknown>[]> {
	if (!sqlite3 || db === null) throw new Error('No database open');
	const rows: Record<string, unknown>[] = [];
	for await (const stmt of sqlite3.statements(db, sql)) {
		if (params.length) sqlite3.bind_collection(stmt, params);
		const cols = sqlite3.column_names(stmt);
		while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
			const r = sqlite3.row(stmt);
			rows.push(Object.fromEntries(cols.map((c, i) => [c, r[i]])));
		}
	}
	return rows;
}

/** Newer LOA Logs keep the listing columns in encounter_preview; older ones only have encounter. */
async function encounterTable() {
	const t = await query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('encounter_preview', 'encounter', 'entity')`);
	const names = new Set(t.map((r) => r.name));
	if (!names.has('entity') || !(names.has('encounter_preview') || names.has('encounter')))
		throw new Error("This doesn't look like a LOA Logs database (encounters.db).");
	return names.has('encounter_preview') ? 'encounter_preview' : 'encounter';
}

// Every run in the file, without gear snapshots: those sit after the big skill columns of each entity row, so reading
// them for every run took ~14 s on a 1.4 GB file (vs ~30 ms for this list). runGear reads them for picked runs only.
async function listEncounters(): Promise<EncounterRow[]> {
	const table = await encounterTable();
	const rows = await query(
		`SELECT id, fight_start AS start, current_boss AS boss, difficulty, cleared, local_player AS player, duration FROM ${table} e ORDER BY fight_start DESC`
	);
	return rows.map((r) => ({
		id: Number(r.id),
		start: Number(r.start),
		boss: String(r.boss ?? ''),
		difficulty: r.difficulty ? String(r.difficulty) : '',
		cleared: r.cleared === null || r.cleared === undefined ? null : Number(r.cleared) === 1,
		player: String(r.player ?? ''),
		duration: Number(r.duration ?? 0),
		loadoutHash: null
	}));
}

/** The player's build per run (gear snapshot hash, Order core grades, spec), for grouping runs before importing them.
 *  All three sit in the same entity row, so reading the extra two costs nothing. */
async function runGear(player: string, ids: number[]): Promise<Record<number, RunGear>> {
	const out: Record<number, RunGear> = Object.fromEntries(ids.map((id) => [id, { hash: null, order: null, spec: null, enlightenment: null, buffs: null }]));
	const columns = new Set((await query(`SELECT name FROM pragma_table_info('entity')`)).map((r) => r.name));
	const pick = (c: string) => (columns.has(c) ? c : `NULL AS ${c}`);
	for (let i = 0; i < ids.length; i += 200) {
		const chunk = ids.slice(i, i + 200);
		// damage_stats sits before loadout_hash in the row, so reading it costs no more pages.
		const rows = await query(`SELECT encounter_id, ${pick('loadout_hash')}, ${pick('spec')}, ${pick('ark_passive_data')}, ${pick('damage_stats')} FROM entity WHERE name = ? AND encounter_id IN (${chunk.map(() => '?').join(',')})`, [player, ...chunk]);
		for (const r of rows) {
			let order: RunGear['order'] = null, enlightenment: RunGear['enlightenment'] = null;
			try {
				const data = r.ark_passive_data ? JSON.parse(String(r.ark_passive_data)) : null;
				const o = data?.arkGridOrder;
				if (o && typeof o === 'object') order = Object.fromEntries((['sun', 'moon', 'star'] as const).flatMap((k) => (Number.isFinite(o[k]) ? [[k, Number(o[k])]] : [])));
				if (Array.isArray(data?.enlightenment)) enlightenment = data.enlightenment.flatMap((n: { id?: unknown; lv?: unknown }) => (Number.isFinite(n?.id) && Number.isFinite(n?.lv) ? [{ id: Number(n.id), lv: Number(n.lv) }] : []));
			} catch { /* old or unreadable passive data */ }
			let buffs: number[] | null = null;
			try {
				const stats = (await decodeSkills(r.damage_stats)) as unknown as { buffedBy?: Record<string, unknown> };
				if (stats?.buffedBy && typeof stats.buffedBy === 'object') buffs = Object.keys(stats.buffedBy).map(Number).filter(Number.isFinite);
			} catch { /* old or unreadable damage stats */ }
			out[Number(r.encounter_id)] = { hash: r.loadout_hash ? String(r.loadout_hash) : null, order, spec: r.spec ? String(r.spec) : null, enlightenment, buffs };
		}
	}
	return out;
}

type LoggedSkill = { id?: number; name?: string; icon?: string; total_damage?: number; totalDamage?: number; timeAvailable?: number };

async function decodeSkills(value: unknown): Promise<Record<string, LoggedSkill>> {
	if (value === null || value === undefined) return {};
	if (typeof value === 'string') return JSON.parse(value);
	const bytes = value as Uint8Array;
	if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
		const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream('gzip'));
		return JSON.parse(await new Response(stream).text());
	}
	return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * Average damage share per skill over the runs, and how much of the fight each skill spent on cooldown. LOA Logs
 * records `timeAvailable` (ready but not cast) for the player who recorded the log; on cooldown = 1 − that / fight.
 */
async function skillShares(player: string, ids: number[]): Promise<{ runs: number; shares: SkillShare[] }> {
	const per = new Map<number, { name: string; icon: string; sum: number; available: number; fight: number }>();
	const table = await encounterTable();
	let runs = 0;
	// Chunk the IN list to stay well under SQLite's parameter limit.
	for (let i = 0; i < ids.length; i += 200) {
		const chunk = ids.slice(i, i + 200);
		const marks = chunk.map(() => '?').join(',');
		const durations = new Map(
			(await query(`SELECT id, duration FROM ${table} WHERE id IN (${marks})`, chunk)).map((r) => [Number(r.id), Number(r.duration) || 0])
		);
		const rows = await query(`SELECT encounter_id, skills FROM entity WHERE name = ? AND encounter_id IN (${marks})`, [player, ...chunk]);
		for (const row of rows) {
			const skills = Object.values(await decodeSkills(row.skills));
			const total = skills.reduce((s, k) => s + Number(k.total_damage ?? k.totalDamage ?? 0), 0);
			if (total <= 0) continue;
			runs++;
			const fight = durations.get(Number(row.encounter_id)) ?? 0;
			for (const k of skills) {
				const id = Number(k.id);
				const entry = per.get(id) ?? { name: k.name ?? `Skill ${id}`, icon: k.icon ?? '', sum: 0, available: 0, fight: 0 };
				entry.sum += Number(k.total_damage ?? k.totalDamage ?? 0) / total;
				if (typeof k.timeAvailable === 'number' && fight > 0) {
					entry.available += Math.min(k.timeAvailable, fight);
					entry.fight += fight;
				}
				per.set(id, entry);
			}
		}
	}
	// Average share per run, so every run counts the same whatever its length.
	const shares = [...per.entries()]
		.map(([id, e]) => ({
			id,
			name: e.name,
			icon: e.icon,
			pct: runs ? (e.sum / runs) * 100 : 0,
			cooldownUse: e.fight > 0 ? Math.max(0, Math.min(1, 1 - e.available / e.fight)) : undefined
		}))
		.filter((s) => s.pct >= 0.01)
		.sort((a, b) => b.pct - a.pct);
	return { runs, shares };
}

/** The meter's per-stat values for the player, averaged over the runs that have them (see stat-values.ts). */
async function statValues(player: string, ids: number[]): Promise<StatValues | null> {
	// `misc` lives on `encounter`; very old databases don't have it.
	const cols = await query(`SELECT name FROM pragma_table_info('encounter')`);
	if (!cols.some((c) => c.name === 'misc')) return null;
	const splits = [];
	const encounterIds: number[] = [];
	for (let i = 0; i < ids.length; i += 200) {
		const chunk = ids.slice(i, i + 200);
		const rows = await query(`SELECT id, misc FROM encounter WHERE id IN (${chunk.map(() => '?').join(',')})`, chunk);
		for (const row of rows) {
			let misc: unknown = null;
			try {
				misc = await decodeSkills(row.misc);
			} catch {
				// unreadable misc: the run just doesn't count
			}
			const split = splitOf(misc, player);
			if (averageStatValues([split])) encounterIds.push(Number(row.id));
			splits.push(split);
		}
	}
	const values = averageStatValues(splits);
	return values ? { ...values, encounterIds } : null;
}

async function replayRuns(player: string, ids: number[]): Promise<ReplayRun[]> {
	const wanted = new Set(ids);
	const encounters = (await listEncounters()).filter(r => wanted.has(r.id));
	const columns = new Set((await query(`SELECT name FROM pragma_table_info('entity')`)).map(r => r.name));
	const miscColumns = new Set((await query(`SELECT name FROM pragma_table_info('encounter')`)).map(r => r.name));
	const cp = columns.has('combat_power') ? 'combat_power' : 'NULL';
	const hash = columns.has('loadout_hash') ? 'loadout_hash' : 'NULL';
	const spec = columns.has('spec') ? 'spec' : 'NULL';
	const passives = columns.has('ark_passive_data') ? 'ark_passive_data' : 'NULL';
	const out: ReplayRun[] = [];
	let retainedHits = 0;
	for (const [index, row] of encounters.entries()) {
		const [entity] = await query(`SELECT skills, ${cp} AS cp, ${hash} AS hash, ${spec} AS spec, ${passives} AS passives FROM entity WHERE encounter_id = ? AND name = ?`, [row.id, player]);
		if (!entity) continue;
		let misc: unknown = null;
		let buffMetadata: Record<string,unknown> = {};
		const fields = ['misc','buffs','debuffs'].map(key => miscColumns.has(key) ? key : `NULL AS ${key}`).join(', ');
		const [encounter] = await query(`SELECT ${fields} FROM encounter WHERE id = ?`, [row.id]);
		try { misc = await decodeSkills(encounter?.misc); } catch { /* old/unreadable misc */ }
		for (const field of ['buffs','debuffs']) try { buffMetadata = {...buffMetadata,...await decodeSkills(encounter?.[field])}; } catch { /* source metadata remains unavailable */ }
		const run = replayRun({ ...row, player }, await decodeSkills(entity.skills) as Record<string, LoggedReplaySkill>, misc, entity.cp, entity.hash, entity.spec, entity.passives, buffMetadata);
		// Retain per-hit data for at most 20 newest contributing runs; metadata still covers the full cohort.
		if (index >= 20 || retainedHits + run.hits.length > 3000) run.hits = [];
		retainedHits += run.hits.length;
		out.push(run);
	}
	return out;
}

/** Compact summaries of these runs for the DPS tab. Only the columns it needs; no hit traces. */
async function runSummaries(player: string, ids: number[]) {
	const wanted = new Set(ids);
	const encounters = (await listEncounters()).filter(r => wanted.has(r.id));
	const columns = new Set((await query(`SELECT name FROM pragma_table_info('entity')`)).map(r => r.name));
	const pick = (name: string) => columns.has(name) ? name : `NULL AS ${name}`;
	const entityColumns = columns;
	const encounterColumns = new Set((await query(`SELECT name FROM pragma_table_info('encounter')`)).map(r => r.name));
	const hasMisc = encounterColumns.has('misc'), hasBuffs = encounterColumns.has('buffs');
	// Runs LOA Logs synced to lostark.bible keep their id there; older databases have no sync table.
	const hasSync = (await query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync_logs'`)).length > 0;
	const names: Record<number, [string, string]> = {};
	const runs = [];
	for (const row of encounters) {
		const [entity] = await query(`SELECT skills, ${pick('class')}, ${pick('combat_power')}, ${pick('gear_score')}, ${pick('spec')}, ${pick('engravings')}, ${pick('ark_passive_data')}, ${pick('loadout_hash')}, ${pick('support_ap')}, ${pick('support_brand')}, ${pick('support_identity')}, ${pick('support_hyper')} FROM entity WHERE encounter_id = ? AND name = ?`, [row.id, player]);
		if (!entity) continue;
		let misc: unknown = null;
		if (hasMisc) try { misc = await decodeSkills((await query(`SELECT misc FROM encounter WHERE id = ?`, [row.id]))[0]?.misc); } catch { /* old/unreadable misc */ }
		// Ark Grid, identity and the player's own class/Ark Passive buffs ("Destiny: Footsteps of the Dead", "Deathlord Mode",
		// "Brawl King Stance"): the meter values Order core effects on the damage dealt under them.
		let keptBuffs: Map<number, string> | undefined;
		if (hasBuffs) try {
			const buffs = await decodeSkills((await query(`SELECT buffs FROM encounter WHERE id = ?`, [row.id]))[0]?.buffs) as Record<string, { buffCategory?: string; target?: string; source?: { name?: string } }>;
			// The player's own states too ("Brawl King Stance", "Level 3 Hype"), not party buffs.
			const kept = (b: { buffCategory?: string; target?: string }) => b?.buffCategory === 'arkgrid' || b?.buffCategory === 'identity' ||
				((b?.buffCategory === 'classskill' || b?.buffCategory === 'arkpassive') && b.target !== 'PARTY');
			keptBuffs = new Map(Object.entries(buffs).filter(([, b]) => kept(b)).map(([id, b]) => [Number(id), b.source?.name ?? '']));
		} catch { /* old/unreadable buffs */ }
		// How far the fight got: the boss's HP at the end, and every player's damage (for this player's share of it).
		let bossHp: { left: number; max: number } | undefined;
		let partyDamage: number | undefined;
		if (entityColumns.has('max_hp') && entityColumns.has('current_hp')) try {
			const [boss] = await query(`SELECT current_hp, max_hp FROM entity WHERE encounter_id = ? AND name = ? AND entity_type = 'BOSS'`, [row.id, row.boss]);
			if (boss && Number(boss.max_hp) > 0) bossHp = { left: Math.max(0, Number(boss.current_hp) || 0), max: Number(boss.max_hp) };
		} catch { /* old logs */ }
		// The encounter's total_damage_dealt is every player's damage summed (checked against their damage_stats).
		if (encounterColumns.has('total_damage_dealt')) try {
			const [total] = await query(`SELECT total_damage_dealt FROM encounter WHERE id = ?`, [row.id]);
			if (Number(total?.total_damage_dealt) > 0) partyDamage = Number(total.total_damage_dealt);
		} catch { /* old logs */ }
		// How many players were down at the end (a cheap column; reading each death record would slow the import a lot).
		let dead: { count: number; of: number } | undefined;
		if (entityColumns.has('is_dead')) try {
			const [counts] = await query(`SELECT SUM(is_dead) AS dead, COUNT(*) AS n FROM entity WHERE encounter_id = ? AND entity_type = 'PLAYER'`, [row.id]);
			if (Number(counts?.n) > 0) dead = { count: Number(counts.dead) || 0, of: Number(counts.n) };
		} catch { /* old logs */ }
		// A support: what their buffs added to each dealer (from the contribution splits in misc) and the buffs' uptime.
		let support: ReturnType<typeof supportRunOf> = null;
		if (SUPPORT_CLASSES.has(String(entity.class))) try {
			const players = await query(`SELECT name, class, ${pick('damage_stats')} FROM entity WHERE encounter_id = ? AND entity_type = 'PLAYER'`, [row.id]);
			const classes = new Map(players.map((r) => [String(r.name), String(r.class)]));
			// Each dealer's uptime on the support's buffs: their damage under them (LOA Logs' buffedBySupport, …) over all of it.
			const uptimes = new Map<string, { attack: number; brand: number; identity: number; hyper: number }>();
			for (const r of players) try {
				const d = await decodeSkills(r.damage_stats) as unknown as Record<string, number>;
				const of = (x: unknown) => Math.min(1, Math.max(0, Number(x) / Number(d.damageDealt)));
				if (Number(d?.damageDealt) > 0) uptimes.set(String(r.name), { attack: of(d.buffedBySupport), brand: of(d.debuffedBySupport), identity: of(d.buffedByIdentity), hyper: of(d.buffedByHat) });
			} catch { /* old logs */ }
			// Each buff's source skill, for core lines that name one ("Paint: Dragon Engraving"); brand is a debuff.
			const skills = new Map<number, string>();
			for (const column of ['buffs', 'debuffs']) if (encounterColumns.has(column)) try {
				const table = await decodeSkills((await query(`SELECT ${column} FROM encounter WHERE id = ?`, [row.id]))[0]?.[column]) as unknown as Record<string, { source?: { skill?: { name?: string } } }>;
				for (const [id, b] of Object.entries(table ?? {})) if (b?.source?.skill?.name) skills.set(Number(id), b.source.skill.name);
			} catch { /* old logs */ }
			const up = [entity.support_ap, entity.support_brand, entity.support_identity, entity.support_hyper].map(Number);
			support = supportRunOf(misc, player, (name) => classes.get(name),
				up.every((x) => Number.isFinite(x) && x >= 0 && x <= 1) ? { attack: up[0], brand: up[1], identity: up[2], hyper: up[3] } : undefined,
				{ skillOf: (id) => skills.get(id), uptimeOf: (name) => uptimes.get(name) });
		} catch { /* old logs */ }
		let upstreamId: unknown;
		if (hasSync) try {
			upstreamId = (await query(`SELECT upstream_id FROM sync_logs WHERE encounter_id = ? AND failed = 0`, [row.id]))[0]?.upstream_id;
		} catch { /* an older sync table */ }
		const run = runSummary({ ...row, player }, {
			skills: await decodeSkills(entity.skills) as Record<string, LoggedRunSkill>,
			combatPower: entity.combat_power, itemLevel: entity.gear_score, spec: entity.spec, engravings: entity.engravings,
			arkPassiveData: entity.ark_passive_data, loadoutHash: entity.loadout_hash, keptBuffs, bossHp, partyDamage, dead, upstreamId, support
		}, misc, names);
		if (run) runs.push(run);
	}
	return { runs, skills: names };
}

self.onmessage = async (e: MessageEvent<LogsRequest>) => {
	const req = e.data;
	const reply = (r: LogsResponse) => self.postMessage(r);
	try {
		if (req.type === 'open') {
			await openDb(req.file);
			reply({ id: req.id, type: 'encounters', encounters: await listEncounters() });
		} else if (req.type === 'shares') {
			reply({ id: req.id, type: 'shares', ...(await skillShares(req.player, req.encounterIds)) });
		} else if (req.type === 'statValues') {
			reply({ id: req.id, type: 'statValues', values: await statValues(req.player, req.encounterIds) });
		} else if (req.type === 'runs') {
			reply({ id: req.id, type: 'runs', ...(await runSummaries(req.player, req.encounterIds)) });
		} else if (req.type === 'replay') {
			reply({ id: req.id, type: 'replay', runs: await replayRuns(req.player, req.encounterIds) });
		} else if (req.type === 'gear') {
			reply({ id: req.id, type: 'gear', gear: await runGear(req.player, req.encounterIds) });
		}
	} catch (err) {
		const code = (err as { code?: number })?.code;
		const message = err instanceof Error ? err.message : String(err);
		reply({ id: req.id, type: 'error', message: code ? `Couldn't read the database (${message}, SQLite code ${code}).` : message });
	}
};
