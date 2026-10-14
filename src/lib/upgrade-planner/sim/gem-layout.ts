import type { GemKind, SimState } from '../simulate';
type Gem = SimState['gems'][number];
export interface GemRow { skill:number|null; slots:Partial<Record<GemKind,number>>; extra:number[] }
/** Retain original skill rows as empty destinations, but place gems by their current assignment. */
export function gemRows(base:Gem[], current:Gem[], indices:number[]):GemRow[] {
 const rows=new Map<string,GemRow>();const order=new Map<string,number>();
 const key=(g:Gem,i:number)=>g.skill===null?`none-${i}`:String(g.skill);
 const ranked=[...indices].sort((a,b)=>base[b].level-base[a].level || Number(base[a].kind==='cooldown')-Number(base[b].kind==='cooldown'));
 for(const i of ranked){const k=key(base[i],i);if(!rows.has(k)){rows.set(k,{skill:base[i].skill,slots:{},extra:[]});order.set(k,order.size);}}
 for(const i of indices){const g=current[i];if(!g)continue;const k=key(g,i);const row=rows.get(k)??{skill:g.skill,slots:{},extra:[]};if(row.slots[g.kind]===undefined)row.slots[g.kind]=i;else row.extra.push(i);rows.set(k,row);}
 return [...rows.entries()].sort(([a],[b])=>(order.get(a)??Infinity)-(order.get(b)??Infinity)).map(([,r])=>r);
}
/** Reassign an existing gem; an occupied destination is never overwritten. */
export function moveGem(gems:Gem[], index:number, skill:number|null, kind:GemKind):boolean {
 if(gems.length>11 || !gems[index] || gems.some((g,i)=>i!==index&&g.skill===skill&&g.kind===kind))return false;
 gems[index].skill=skill;gems[index].kind=kind;return true;
}
