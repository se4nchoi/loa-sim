// Local-only short-link experiment. Run the size experiment first, then this script.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const { links } = JSON.parse(readFileSync('cache/share-link-experiment-results.json', 'utf8'));
const mappings = Object.fromEntries(Object.entries(links).map(([mode, url]) => {
  const target = '/lab' + new URL(url).hash;
  return [createHash('sha256').update(target).digest('base64url').slice(0, 12), { mode, target }];
}));
writeFileSync('cache/share-short-links.json', JSON.stringify(mappings, null, 2));
const { outputFiles } = await build({stdin:{contents:`
import { initSimState } from './src/lib/upgrade-planner/simulate';
import { parseSimulation, simulationCP } from './src/lib/upgrade-planner/saved-simulations';
import recipeFixture from './src/lib/upgrade-planner/fixtures/na-soulshan.json';
async function main() {
  const fragment = location.hash;
  if (!fragment.startsWith('#build=v1.')) throw new Error('Unsupported version');
  const encoded = fragment.slice('#build=v1.'.length);
  const binary = atob(encoded.replaceAll('-', '+').replaceAll('_', '/'));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  const json = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).text();
  const payload = JSON.parse(json);
  if (payload.v !== 1) throw new Error('Unsupported payload');
  const recipe = !payload.l;
  const loadout = payload.l ?? recipeFixture;
  const base = initSimState(loadout);
  const state = payload.s ?? {...base, ...payload.e};
  if (payload.p) for (const [path, value] of payload.p) {
    if (!path.length || path.some(k => ['__proto__','prototype','constructor'].includes(k))) throw new Error('Invalid patch');
    let target = state;
    for (const key of path.slice(0,-1)) target = target[key];
    target[path.at(-1)] = value;
  }
  const plan = parseSimulation(JSON.stringify({version:1,id:'browser-experiment',name:'Shared upgrades',characterKey:payload.c,savedAt:0,loadout,state}));
  document.querySelector('pre').textContent = 'PASS: ' + (recipe ? 'recipe applied to bundled Soulshan test fixture (not live bible)' : 'frozen simulation loaded from URL fragment') + '\\nCharacter: ' + payload.c + '\\nCP: ' + simulationCP(plan).toFixed(8) + '\\nWeapon: +' + state.gear.weapon.honing + '\\nGem levels: ' + state.gems.map(g=>g.level).join(', ') + '\\nFinal URL length: ' + location.href.length + '\\nNo bible request or browser save was needed.';
}
main().catch(e => document.querySelector('pre').textContent = 'FAIL: ' + e.message);
`,resolveDir:process.cwd(),loader:'js'},bundle:true,platform:'browser',format:'esm',write:false});
const js = outputFiles[0].text;
const page = '<!doctype html><html lang="en"><meta charset="utf-8"><title>Local share-link experiment</title><body><h1>Local share-link experiment</h1><pre>Loading…</pre><script type="module" src="/lab.js"></script></body></html>';
const labels = {full:'Full baseline + full simulation',sections:'Frozen baseline + changed sections',leaves:'Frozen baseline + individual edits',recipe:'Recipe only (bundled test baseline, not live bible)'};
const examples = '<!doctype html><html lang="en"><meta charset="utf-8"><title>Build link examples</title><body><h1>Build link examples</h1><p>Soulshan: weapon +25 and level 10 gems. Local experiments only; no browser saves.</p><ul>' + Object.entries(mappings).map(([id, {mode,target}]) => '<li><h2>' + labels[mode] + '</h2><a href="' + target + '">Open long link (' + ('http://127.0.0.1:5174' + target).length + ' characters)</a> · <a href="/s/' + id + '">Open shortened link</a></li>').join('') + '</ul></body></html>';
const server = createServer((req, res) => {
  console.log('HTTP request:', req.url); // Confirms fragments don't reach the server.
  const path = req.url?.split('?')[0];
  if (path === '/examples') { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); res.end(examples); return; }
  if (path?.startsWith('/s/')) {
    const mapping = mappings[path.slice(3)];
    if (!mapping) { res.writeHead(404); res.end('Shared link not found'); return; }
    res.writeHead(302, { Location: mapping.target, 'Cache-Control': 'no-store' }); res.end(); return;
  }
  if (path === '/lab.js') { res.writeHead(200, {'Content-Type':'text/javascript'}); res.end(js); return; }
  if (path === '/lab') { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); res.end(page); return; }
  res.writeHead(404); res.end('Not found');
});
server.listen(5174, '127.0.0.1', async () => {
  for (const [id, mapping] of Object.entries(mappings)) console.log(mapping.mode + ': http://127.0.0.1:5174/s/' + id);
  if (process.argv.includes('--verify')) {
    try {
      const persisted = JSON.parse(readFileSync('cache/share-short-links.json', 'utf8'));
      assert.deepEqual(persisted, mappings);
      for (const [id, mapping] of Object.entries(persisted)) {
        const response = await fetch(`http://127.0.0.1:5174/s/${id}`, {redirect:'manual'});
        assert.equal(response.status, 302);
        assert.equal(response.headers.get('location'), mapping.target);
        console.log(`${mapping.mode}: exact redirect verified; production URL length ${('https://loa-sim.vercel.app/s/' + id).length}`);
      }
      const missing = await fetch('http://127.0.0.1:5174/s/missing', {redirect:'manual'});
      assert.equal(missing.status, 404);
      console.log('PASS: persisted mappings, exact redirects, and missing-ID handling.');
    } catch (e) { console.error(e); process.exitCode = 1; }
    finally { server.close(); }
  }
});
