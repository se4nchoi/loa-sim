import type { Loadout } from './upgrade-planner/types';

export const storedRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const rows = (v: unknown, check: (row: Record<string, unknown>) => boolean) =>
 v == null || Array.isArray(v) && v.every((r) => storedRecord(r) && check(r));
const DATA_SLOTS = new Set(['weapon', 'head', 'shoulder', 'upper_body', 'lower_body', 'hand', 'neck', 'ear1', 'ear2', 'finger1', 'finger2', 'ability_stone', 'bracelet']);

/** Validate storage boundaries without depending on a particular game's item/engraving catalog version. */
export function isStoredLoadout(v: unknown): v is Loadout {
 if (!storedRecord(v) || typeof v.classId !== 'string' || !finite(v.itemLevel) || !storedRecord(v.battlePoint) ||
  typeof v.battlePoint.isSupport !== 'boolean' || !Array.isArray(v.battlePoint.parts)) return false;
 const parts = v.battlePoint.parts;
 if (!parts.every((p) => storedRecord(p) && finite(p.type) &&
  ['value', 'min', 'max'].every((k) => p[k] === undefined || finite(p[k])))) return false;
 if (!parts.some((p) => p.type === 1 && (p.value ?? p.max ?? 0) > 0)) return false;
 if (v.combatPower != null && (!storedRecord(v.combatPower) || !finite(v.combatPower.score))) return false;
 const stat = (s: Record<string, unknown>) => finite(s.type) && finite(s.value);
 return rows(v.items, (i) => finite(i.id) && typeof i.slot === 'string' &&
   (i.data === undefined && !DATA_SLOTS.has(i.slot) || storedRecord(i.data) &&
    rows(i.data.stats, stat) && rows(i.data.engravings, (e) => finite(e.id) && finite(e.nodes)))) &&
  rows(v.gems, (g) => finite(g.id) && finite(g.slot) && rows(g.effects, (e) => finite(e.type) && finite(e.id) && finite(e.value))) &&
  rows(v.engravings, (e) => finite(e.id) && typeof e.grade === 'string' && finite(e.progress)) &&
  rows(v.stats, stat) &&
  rows(v.arkGridCores, (c) => finite(c.id) && finite(c.base) && Array.isArray(c.gems) && rows(c.gems, (g) =>
   finite(g.id) && finite(g.idx) && finite(g.corePoints) && finite(g.costReduc) && Array.isArray(g.opts) &&
   rows(g.opts, (o) => finite(o.id) && finite(o.level))));
}
