import { describe, expect, it } from 'vitest';
import { COMBAT_ENGRAVING_IDS } from './engraving-catalog';
import { ENGRAVING_ICONS } from './game-data';
import { roleOf } from './roles';
import { PartType } from './cp';
import { initSimState, simulate } from './simulate';
import { engravingStates } from './upgrades';
import soulshan from './fixtures/na-soulshan.json';
import brushann from './fixtures/na-brushann.json';
import type { Loadout } from './types';

describe.each([['dealer', soulshan], ['support', brushann]] as const)('%s engraving coverage', (_, fixture) => {
 const loadout = fixture as unknown as Loadout;
 const role = roleOf(loadout);
 it('offers every catalog combat engraving and excludes stone penalties', () => {
  expect([...role.engravingIds()].sort()).toEqual([...COMBAT_ENGRAVING_IDS].sort());
  expect(COMBAT_ENGRAVING_IDS).toHaveLength(Object.keys(ENGRAVING_ICONS).filter((id) => Number(id) < 1800).length);
  for (const id of [1800, 1801, 1802, 1803]) expect(role.engravingIds()).not.toContain(id);
 });
 it.each(COMBAT_ENGRAVING_IDS)('keeps engraving %i visible and supports a finite swap in both directions', (id) => {
  const l = structuredClone(loadout);
  const table = role.engraving(id)!;
  l.engravings = [{ id, grade: 'engrave_grade05', progress: 0 }];
  l.battlePoint.parts = l.battlePoint.parts.filter((p) => p.type !== PartType.Engraving && p.type !== PartType.EngravingDefense);
  if (table.table[0][4]) l.battlePoint.parts.push({ type: table.defense ? PartType.EngravingDefense : PartType.Engraving, id, value: table.table[0][4], stonePoints: 0 });
  const base = initSimState(l);
  expect(Object.keys(base.engravings)).toEqual([String(id)]);
  expect(base.engravings[id].books).toBe(4);
  const before = simulate(l, base, base).cp;
  const state = structuredClone(base);
  state.engravings[id].as = id === 1236 ? 1109 : 1236;
  expect(Number.isFinite(simulate(l, state, base).cp)).toBe(true);
  delete state.engravings[id].as;
  expect(simulate(l, state, base).cp).toBe(before);
 });
 it('preserves unfamiliar imported engraving CP instead of hiding or zeroing the slot', () => {
  const l = structuredClone(loadout);
  const part = l.battlePoint.parts.find((p) => p.type === PartType.Engraving)!;
  const oldId = part.id;
  part.id = 9999;
  l.engravings!.find((e) => e.id === oldId)!.id = 9999;
  const base = initSimState(l);
  expect(base.engravings[9999]).toBeDefined();
  const e = engravingStates(l).find((e) => e.id === 9999)!;
  expect(e.table[4][4]).toBe(part.value);
  const state = structuredClone(base);
  state.engravings[9999] = { books: 4, stone: 0 };
  expect(simulate(l, state, base).parts.find((p) => p.id === 9999)?.value).toBe(part.value);
 });
});
