import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	// The LOA Logs importer's SQLite loads in a worker only when a file is picked; prebundle it at startup so the dev
	// server doesn't discover it then and reload the page (losing the chosen file).
	optimizeDeps: { include: ['wa-sqlite', 'wa-sqlite/dist/wa-sqlite.mjs', 'wa-sqlite/src/VFS.js'] },
	test: { include: ['src/**/*.test.ts'] }
});
