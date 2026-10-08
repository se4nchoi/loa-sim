/// <reference lib="webworker" />
// Reads a LOA Logs database (encounters.db) the player picked, entirely in the browser.
// SQLite runs in WebAssembly with a read-only VFS that pulls only the pages it needs straight from the File,
// so multi-GB databases open instantly without being copied into memory. Nothing leaves the machine.

import * as SQLite from 'wa-sqlite';
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import wasmUrl from 'wa-sqlite/dist/wa-sqlite.wasm?url';
import * as VFS from 'wa-sqlite/src/VFS.js';
import type { LogsRequest, LogsResponse, SkillShare, EncounterRow } from './protocol';

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

async function listEncounters(): Promise<EncounterRow[]> {
	const table = await encounterTable();
	const rows = await query(
		`SELECT id, fight_start AS start, current_boss AS boss, difficulty, cleared, local_player AS player, duration FROM ${table} ORDER BY fight_start DESC`
	);
	return rows.map((r) => ({
		id: Number(r.id),
		start: Number(r.start),
		boss: String(r.boss ?? ''),
		difficulty: r.difficulty ? String(r.difficulty) : '',
		cleared: r.cleared === null || r.cleared === undefined ? null : Number(r.cleared) === 1,
		player: String(r.player ?? ''),
		duration: Number(r.duration ?? 0)
	}));
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

self.onmessage = async (e: MessageEvent<LogsRequest>) => {
	const req = e.data;
	const reply = (r: LogsResponse) => self.postMessage(r);
	try {
		if (req.type === 'open') {
			await openDb(req.file);
			reply({ id: req.id, type: 'encounters', encounters: await listEncounters() });
		} else if (req.type === 'shares') {
			reply({ id: req.id, type: 'shares', ...(await skillShares(req.player, req.encounterIds)) });
		}
	} catch (err) {
		const code = (err as { code?: number })?.code;
		const message = err instanceof Error ? err.message : String(err);
		reply({ id: req.id, type: 'error', message: code ? `Couldn't read the database (${message}, SQLite code ${code}).` : message });
	}
};
