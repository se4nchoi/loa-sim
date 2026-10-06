// Fetch one NA/CE character from lostark.bible and save its Ark Passive loadout as plain JSON.
//
//   node fetch-character.mjs NA Soulshan            -> one polite request, cached in ./cache
//   node fetch-character.mjs --file saved.json      -> decode a __data.json you saved from your browser
//
// lostark.bible's robots.txt disallows automated access. Keep this to occasional lookups of
// your own characters; don't loop it over many names without the site owner's permission.

import fs from 'node:fs';
import path from 'node:path';
import { computeCombatPower } from './cp.mjs';

const CACHE_DIR = 'cache';
const OUT_DIR = 'out';
const CACHE_TTL_MS = 30 * 60 * 1000;

// SvelteKit serializes page data with devalue's "flatten" format: a flat array where
// objects/arrays hold indices into that array. Negative indices are special constants.
function unflatten(values) {
  const hydrated = new Array(values.length);
  const special = { '-1': undefined, '-3': NaN, '-4': Infinity, '-5': -Infinity, '-6': -0 };
  function hydrate(i) {
    if (i in special) return special[i];
    if (i in hydrated) return hydrated[i];
    const v = values[i];
    if (v === null || typeof v !== 'object') return (hydrated[i] = v);
    if (Array.isArray(v)) {
      if (typeof v[0] === 'string') {
        // Tagged values (Date, Map, Set, ...). bible's character page doesn't use these today.
        const [tag, ...rest] = v;
        if (tag === 'Date') return (hydrated[i] = new Date(rest[0]));
        throw new Error(`Unsupported devalue tag: ${tag}`);
      }
      const arr = (hydrated[i] = []);
      for (const j of v) arr.push(hydrate(j));
      return arr;
    }
    const obj = (hydrated[i] = {});
    for (const k in v) obj[k] = hydrate(v[k]);
    return obj;
  }
  return hydrate(0);
}

async function loadRaw(region, name) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = path.join(CACHE_DIR, `${region}-${name}.json`.toLowerCase());
  if (fs.existsSync(cacheFile) && Date.now() - fs.statSync(cacheFile).mtimeMs < CACHE_TTL_MS) {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  }
  const url = `https://lostark.bible/character/${region}/${encodeURIComponent(name)}/__data.json?x-sveltekit-invalidated=001`;
  const res = await fetch(url, { headers: { 'user-agent': 'loa-eff personal CP simulator' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const raw = await res.json();
  fs.writeFileSync(cacheFile, JSON.stringify(raw));
  return raw;
}

function extractCharacter(raw) {
  const node = raw.nodes.findLast(n => n?.type === 'data');
  const page = unflatten(node.data);
  const loadout = page.loadouts?.find(l => l.type === 'ark_passive' && l.battlePoint);
  if (!loadout) throw new Error('No Ark Passive loadout with battlePoint data on this character');
  return { characterInfo: page.characterInfo, loadout };
}

const args = process.argv.slice(2);
let raw, label;
if (args[0] === '--file') {
  raw = JSON.parse(fs.readFileSync(args[1], 'utf8'));
  label = path.basename(args[1], '.json');
} else {
  const [region = 'NA', name] = args;
  if (!name) {
    console.error('usage: node fetch-character.mjs <NA|CE> <name>  |  --file <__data.json>');
    process.exit(1);
  }
  raw = await loadRaw(region.toUpperCase(), name);
  label = `${region}-${name}`.toLowerCase();
}

const character = extractCharacter(raw);
const cp = computeCombatPower(character.loadout.battlePoint.parts);
fs.mkdirSync(OUT_DIR, { recursive: true });
const outFile = path.join(OUT_DIR, `${label}.json`);
fs.writeFileSync(outFile, JSON.stringify(character, null, 1));

console.log(`${label}: ilvl ${character.loadout.itemLevel}, ${character.loadout.classId}`);
console.log(`  bible CP      ${character.loadout.combatPower?.score}`);
console.log(`  recomputed CP ${cp.attackMax.toFixed(2)} (pet range low ${cp.attackMin.toFixed(2)})`);
console.log(`  saved ${outFile} -> open simulator.html and load it`);
