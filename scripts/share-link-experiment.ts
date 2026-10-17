import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { deepStrictEqual, equal, rejects } from 'node:assert/strict';
import { initSimState, simulate } from '../src/lib/upgrade-planner/simulate';
import { parseSimulation, simulationCP } from '../src/lib/upgrade-planner/saved-simulations';
import type { Loadout } from '../src/lib/upgrade-planner/types';

// Experimental wire format; not a supported public share link yet.
type Operation = [string[], unknown];
function diff(before: any, after: any, path: string[] = []): Operation[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (before && after && typeof before === 'object' && typeof after === 'object'
    && Array.isArray(before) === Array.isArray(after)
    && Object.keys(before).join() === Object.keys(after).join()) {
    return Object.keys(after).flatMap(key => diff(before[key], after[key], [...path, key]));
  }
  return [[path, after]];
}
function patch<T>(base: T, operations: Operation[]): T {
  const value = structuredClone(base);
  for (const [path, replacement] of operations) {
    if (!path.length || path.some(key => ['__proto__', 'prototype', 'constructor'].includes(key))) throw new Error('Invalid path');
    let target: any = value;
    for (const key of path.slice(0, -1)) target = target[key];
    target[path.at(-1)!] = structuredClone(replacement);
  }
  return value;
}
const prefix = 'https://loa-sim.vercel.app/sim#build=v1.';
const formats = ['deflate', 'gzip', 'deflate-raw'] as const;
async function encode(payload: unknown, format: typeof formats[number]) {
  const json = JSON.stringify(payload);
  const bytes = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream(format))).arrayBuffer();
  return prefix + Buffer.from(bytes).toString('base64url');
}
async function decode(url: string, format: typeof formats[number]) {
  const encoded = new URL(url).hash.slice('#build=v1.'.length);
  const bytes = Buffer.from(encoded, 'base64url');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return JSON.parse(await new Response(stream).text());
}

const results: any[] = [];
const links: Record<string, string> = {};
let checks = 0;
for (const file of readdirSync('src/lib/upgrade-planner/fixtures').filter(f => f.endsWith('.json') && !f.includes('-cp'))) {
  const loadout: Loadout = JSON.parse(readFileSync(`src/lib/upgrade-planner/fixtures/${file}`, 'utf8'));
  const base = initSimState(loadout);
  for (const scenario of ['unchanged', 'weapon', 'weapon-gems', 'several-sections']) {
    const state = structuredClone(base);
    if (scenario !== 'unchanged' && state.gear.weapon) state.gear.weapon.honing = 25;
    if (scenario === 'weapon-gems' || scenario === 'several-sections') for (const gem of state.gems) gem.level = 10;
    if (scenario === 'several-sections') {
      for (const engraving of Object.values(state.engravings)) engraving.books = 4;
      for (const slot of Object.keys(state.quality)) state.quality[slot] = 100;
      for (const key of Object.keys(state.accessories)) state.accessories[key] = (state.accessories[key] ?? []).map(line => line.key === 'other' ? line : { ...line, tier: 'high' });
    }
    const plan = parseSimulation(JSON.stringify({version:1,id:'experiment',name:'Shared upgrades',characterKey:file.replace('.json','').replace('-', '/'),savedAt:1792191600000,loadout,state}));
    const sectionEdits = Object.fromEntries(Object.entries(state).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(base[key])));
    const leafEdits = diff(base, state);
    const payloads = {
      full: {v:1,c:plan.characterKey,l:loadout,s:state},
      sections: {v:1,c:plan.characterKey,l:loadout,e:sectionEdits},
      leaves: {v:1,c:plan.characterKey,l:loadout,p:leafEdits},
      recipe: {v:1,c:plan.characterKey,p:leafEdits}
    };
    const lengths: Record<string, number> = {};
    for (const [mode, payload] of Object.entries(payloads)) for (const format of formats) {
      const url = await encode(payload, format);
      const restored = await decode(url, format);
      deepStrictEqual(restored, payload);
      const restoredLoadout = restored.l ?? loadout; // Recipe requires the SAME bible baseline for this assertion.
      const restoredBase = initSimState(restoredLoadout);
      const restoredState = restored.s ?? (restored.e ? {...restoredBase, ...restored.e} : patch(restoredBase, restored.p));
      deepStrictEqual(restoredState, state);
      deepStrictEqual(restoredLoadout, loadout);
      const restoredPlan = parseSimulation(JSON.stringify({...plan,loadout:restoredLoadout,state:restoredState}));
      equal(simulationCP(restoredPlan), simulationCP(plan));
      lengths[`${mode}/${format}`] = url.length;
      checks++;
      if (file === 'na-soulshan.json' && scenario === 'weapon-gems' && format === 'deflate') links[mode] = url;
    }
    results.push({file,scenario,changedLeaves:leafEdits.length,cp:simulationCP(plan),lengths});
  }
}

// A recipe doesn't freeze unknown/unmodified baseline bonuses or the starting score.
const original: Loadout = JSON.parse(readFileSync('src/lib/upgrade-planner/fixtures/na-soulshan.json','utf8'));
const newer = structuredClone(original);
newer.combatPower!.score += 100;
const originalBase = initSimState(original), edited = structuredClone(originalBase);
edited.gear.weapon!.honing = 25;
const operations = diff(originalBase, edited);
function cp(loadout: Loadout) {
  const base = initSimState(loadout);
  return (loadout.combatPower!.score) * simulate(loadout, patch(base, operations), base).cp / simulate(loadout, base, base).cp;
}
const baselineDrift = {original:cp(original),changedBibleBaseline:cp(newer)};
for (const format of formats) {
  const link = await encode({test:'Corruption must fail '.repeat(20)}, format);
  await rejects(() => decode(link.slice(0, -12), format));
}
writeFileSync('cache/share-link-experiment-results.json', JSON.stringify({checks,results,baselineDrift,links}, null, 2));
console.log(`Passed ${checks} payload/state/CP round trips and 3 truncated-payload checks.`);
for (const mode of ['full','sections','leaves','recipe']) {
  const values = results.map(r => r.lengths[`${mode}/deflate`]);
  console.log(`${mode}: ${Math.min(...values)}–${Math.max(...values)} characters (whole URL)`);
}
console.log('Recipe baseline drift:', baselineDrift);
console.log('Detailed results and example links: cache/share-link-experiment-results.json');
