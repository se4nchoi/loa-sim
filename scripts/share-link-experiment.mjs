// Run with node scripts/share-link-experiment.mjs. No network or browser storage.
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

await mkdir('cache', { recursive: true });
await build({ entryPoints: ['scripts/share-link-experiment.ts'], bundle: true,
  platform: 'node', format: 'esm', outfile: 'cache/share-link-experiment.bundle.mjs' });
await import(pathToFileURL(`${process.cwd()}/cache/share-link-experiment.bundle.mjs`).href);
