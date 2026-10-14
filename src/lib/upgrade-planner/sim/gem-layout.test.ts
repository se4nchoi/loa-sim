import {describe,it,expect} from 'vitest';
import {gemRows,moveGem} from './gem-layout';
import {initSimState} from '../simulate';
import type {Loadout} from '../types';
import fixture from '../fixtures/na-soulshan.json';
describe('moving equipped gems',()=>{
 it('moves into a one-gem skill without creating a twelfth gem',()=>{
  const state=initSimState(fixture as unknown as Loadout),base=structuredClone(state.gems);
  const rows=gemRows(base,state.gems,base.map((_,i)=>i));
  const row=rows.find(r=>r.skill!==null&&Object.keys(r.slots).length===1)!;
  const kind=row.slots.damage===undefined?'damage':'cooldown';
  const donor=state.gems.findIndex(g=>g.skill!==row.skill);
  const original=structuredClone(state.gems[donor]);
  expect(moveGem(state.gems,donor,row.skill,kind)).toBe(true);
  expect(state.gems).toHaveLength(base.length);expect(state.gems.length).toBeLessThanOrEqual(11);
  expect(state.gems[donor]).toEqual({...original,skill:row.skill,kind});
  const moved=gemRows(base,state.gems,base.map((_,i)=>i));
  expect(moved.find(r=>r.skill===row.skill)?.slots[kind]).toBe(donor);
  expect(moved.filter(r=>r.skill!==row.skill).flatMap(r=>[...Object.values(r.slots),...r.extra])).not.toContain(donor);
 });
 it('rejects occupied destinations and invalid indices without changing inventory',()=>{
  const gems=initSimState(fixture as unknown as Loadout).gems;const before=structuredClone(gems);
  expect(moveGem(gems,1,gems[0].skill,gems[0].kind)).toBe(false);
  expect(moveGem(gems,999,123,'damage')).toBe(false);expect(gems).toEqual(before);
 });
 it('retains empty original skill rows for moving gems back',()=>{
  const base=[{skill:1,kind:'damage' as const,level:9},{skill:2,kind:'cooldown' as const,level:8}];
  const gems=structuredClone(base);moveGem(gems,0,2,'damage');
  expect(gemRows(base,gems,[0,1]).find(r=>r.skill===1)?.slots).toEqual({});
  expect(moveGem(gems,0,1,'damage')).toBe(true);expect(gems).toEqual(base);
 });
});
