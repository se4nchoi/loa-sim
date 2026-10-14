import { initSimState, simulate, type SimState } from './simulate';
import type { Loadout } from './types';
import { BRACER_LIMITS } from './bracer';

const KEY = 'loa-sim:simulations:v1';
const LIMIT = 24;
export interface SavedSimulation {
	version: 1;
	id: string;
	name: string;
	characterKey: string;
	savedAt: number;
	loadout: Loadout;
	state: SimState;
}

/** Includes the entire baseline: identical editable gear alone does not imply identical CP. */
export const sameBaseline = (a: Loadout, b: Loadout) => JSON.stringify(a) === JSON.stringify(b);

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const level = (v: unknown, min: number, max: number) => number(v) && Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
function validState(s: SimState): boolean {
	if (!record(s) || !['gear', 'quality', 'accessories', 'engravings', 'accessoryStats', 'skillShares', 'skillCooldownUse', 'karma', 'skins'].every((k) => record(s[k]))) return false;
	if (!Object.values(s.gear).every((g) => record(g) && level(g.honing, 0, 25) && level(g.advanced, 0, 40) && (g.set === undefined || g.set === 'aegir'))) return false;
	if (!Array.isArray(s.gems) || !s.gems.every((g) => record(g) && level(g.level, 1, 10) && ['damage', 'cooldown'].includes(g.kind) && (g.skill === null || number(g.skill)))) return false;
	if (!Object.values(s.accessories).every((lines) => Array.isArray(lines) && lines.every((l) => record(l) && typeof l.key === 'string' && (l.key === 'other' ? typeof (l as unknown as Record<string, unknown>).label === 'string' : ['high', 'mid', 'low'].includes(String((l as unknown as Record<string, unknown>).tier)))))) return false;
	if (!Object.values(s.engravings).every((e) => record(e) && level(e.books, 0, 4) && level(e.stone, 0, 4))) return false;
	if (!['quality', 'accessoryStats', 'skillShares', 'skillCooldownUse'].every((k) => Object.values(s[k] as object).every(number))) return false;
	if (!Object.values(s.karma).every((n) => n === null || number(n))) return false;
	if (![s.skins.bonus, s.skins.currentBonus].every((n) => n === null || number(n))) return false;
	if (s.skins.parts && (!Array.isArray(s.skins.parts) || s.skins.parts.length !== 4 || !s.skins.parts.every((n) => n === null || number(n)))) return false;
	if (s.skins.startingParts && (!Array.isArray(s.skins.startingParts) || s.skins.startingParts.length !== 4 || !s.skins.startingParts.every(number))) return false;
	if (s.bracer !== null && (!record(s.bracer) || !number(s.bracer.honing) || !['epic', 'legendary', 'relic', 'ancient'].includes(s.bracer.grade))) return false;
	if (s.bracer) {
		const [min, max] = BRACER_LIMITS[s.bracer.grade];
		if (!level(s.bracer.honing, min, max)) return false;
	}
	if (s.sidereal !== null && (!record(s.sidereal) || ![s.sidereal.infusion, s.sidereal.evolution, s.sidereal.advanced].every(number))) return false;
	if (s.paradise !== null && (!record(s.paradise) || !number(s.paradise.orb) || !number(s.paradise.k) || typeof s.paradise.flat !== 'boolean' || !record(s.paradise.powers) || !Object.values(s.paradise.powers).every(number))) return false;
	if (s.bracelet !== null && (!record(s.bracelet) || !Array.isArray(s.bracelet.lines) || !s.bracelet.lines.every((l) => record(l) && (l.kind === 'empty' || l.kind === 'effect' && typeof l.key === 'string' || l.kind === 'stat' && number(l.index) && number(l.value))))) return false;
	return Array.isArray(s.arkGrid) && s.arkGrid.every((c) => record(c) && number(c.id) && Array.isArray(c.gems) && c.gems.every((g) => record(g) && [g.itemId, g.corePoints, g.costReduc].every(number) && Array.isArray(g.opts) && g.opts.every((o) => record(o) && number(o.id) && number(o.level))));
}

function finiteJson(value: unknown, depth = 0): boolean {
	if (depth > 30) return false;
	if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
	if (typeof value === 'number') return Number.isFinite(value);
	if (Array.isArray(value)) return value.length <= 1000 && value.every((v) => finiteJson(v, depth + 1));
	return !!value && typeof value === 'object' && Object.entries(value).every(([k, v]) =>
		!['__proto__', 'constructor', 'prototype'].includes(k) && finiteJson(v, depth + 1));
}

/** Imported files must be complete snapshots whose state can actually be simulated. */
export function parseSimulation(json: string): SavedSimulation {
	if (json.length > 2_000_000) throw new Error('This simulation file is too large.');
	try {
		const s = JSON.parse(json) as SavedSimulation;
		if (!finiteJson(s) || s.version !== 1 || typeof s.id !== 'string' || !s.id || typeof s.name !== 'string' ||
			!s.name.trim() || s.name.length > 80 || typeof s.characterKey !== 'string' || !s.characterKey || typeof s.savedAt !== 'number' || !s.loadout || !validState(s.state)) throw new Error();
		const base = initSimState(s.loadout);
		if (Object.keys(base).some((key) => !(key in s.state)) || Object.keys(s.state).some((key) => !(key in base))) throw new Error();
		const result = simulate(s.loadout, s.state, base);
		if (![result.cp, result.mainStat, result.weaponPower].every(Number.isFinite)) throw new Error();
		return s;
	} catch { throw new Error('This is not a supported simulation file.'); }
}

export function savedSimulations(characterKey?: string): SavedSimulation[] {
	try {
		const values: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
		if (!Array.isArray(values)) return [];
		return values.flatMap((value) => {
			try { return [parseSimulation(JSON.stringify(value))]; } catch { return []; }
		}).filter((s) => !characterKey || s.characterKey.toLowerCase() === characterKey.toLowerCase())
			.sort((a, b) => b.savedAt - a.savedAt);
	} catch { return []; }
}

/** Throws on blocked/full storage so the UI never promises a save that did not persist. */
export function saveSimulation(characterKey: string, name: string, loadout: Loadout, state: SimState): SavedSimulation {
	if (!characterKey) throw new Error('Load a character before saving a simulation.');
	const trimmed = name.trim();
	if (!trimmed || trimmed.length > 80) throw new Error('Use a name between 1 and 80 characters.');
	const s = parseSimulation(JSON.stringify({ version: 1, id: crypto.randomUUID(), name: trimmed, characterKey: characterKey.toLowerCase(), savedAt: Date.now(), loadout, state }));
	const list = savedSimulations();
	const existing = list.find(plan => plan.characterKey === s.characterKey && plan.name === s.name &&
		sameBaseline(plan.loadout, s.loadout) && JSON.stringify(plan.state) === JSON.stringify(s.state));
	if (existing) return existing;
	if (list.length >= LIMIT) throw new Error(`You have ${LIMIT} saved simulations. Delete one before saving another.`);
	try { localStorage.setItem(KEY, JSON.stringify([s, ...list])); }
	catch { throw new Error('Browser storage is full or blocked. Export a file to keep your changes.'); }
	return s;
}

export function deleteSimulation(id: string) {
	try { localStorage.setItem(KEY, JSON.stringify(savedSimulations().filter((s) => s.id !== id))); }
	catch { throw new Error('Browser storage is blocked; the simulation could not be deleted.'); }
}

export function renameSimulation(id: string, name: string): void {
	const title = name.trim();
	if (!title || title.length > 80) throw new Error('Use a name between 1 and 80 characters.');
	const list = savedSimulations();
	const saved = list.find(s => s.id === id);
	if (!saved) throw new Error('This saved simulation no longer exists.');
	if (saved.name === title) return;
	saved.name = title;
	try { localStorage.setItem(KEY, JSON.stringify(list)); }
	catch { throw new Error('Browser storage is blocked; the simulation could not be renamed.'); }
}

export function latestSimulation(characterKey: string, loadout: Loadout): SavedSimulation | undefined {
	return savedSimulations(characterKey).find((s) => sameBaseline(s.loadout, loadout));
}

const draftKey = (characterKey: string) => `loa-sim:autosave:v1:${characterKey.toLowerCase()}`;
function drafts(characterKey: string): SavedSimulation[] {
	try {
		const list: unknown = JSON.parse(localStorage.getItem(draftKey(characterKey)) ?? '[]');
		return Array.isArray(list) ? list.filter((s): s is SavedSimulation => record(s) && s.version === 1 &&
			s.characterKey === characterKey.toLowerCase() && record(s.loadout) && record(s.state)) : [];
	} catch { return []; }
}

/** Automatic working copies are separate from the player's named plans. */
export function loadAutosave(characterKey: string, loadout: Loadout): SimState | undefined {
	if (!characterKey) return;
	const saved = drafts(characterKey).find(s => sameBaseline(s.loadout, loadout));
	if (!saved) return;
	try { return parseSimulation(JSON.stringify(saved)).state; } catch { return; }
}

/** Save synchronously after edits; invalid intermediate input must not replace a valid working copy. */
export function autosaveSimulation(characterKey: string, loadout: Loadout, state: SimState): void {
	if (!characterKey || !finiteJson(state) || !validState(state)) return;
	const list = drafts(characterKey);
	const previous = list.find(s => sameBaseline(s.loadout, loadout));
	if (previous && JSON.stringify(previous.state) === JSON.stringify(state)) return;
	const saved: SavedSimulation = {version:1,id:'autosave',name:'Autosave',characterKey:characterKey.toLowerCase(),savedAt:Date.now(),loadout,state};
	try { localStorage.setItem(draftKey(characterKey), JSON.stringify([saved,...list.filter(s => !sameBaseline(s.loadout, loadout))].slice(0,8))); }
	catch { throw new Error('Autosave unavailable: browser storage is full or blocked. Export a file to keep your changes.'); }
}
