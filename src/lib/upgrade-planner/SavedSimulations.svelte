<script lang="ts">
	import { untrack } from 'svelte';
	import { deleteSimulation, latestSimulation, parseSimulation, sameBaseline, savedSimulations, saveSimulation, type SavedSimulation } from './saved-simulations';
	import type { SimState } from './simulate';
	import type { Loadout } from './types';
	import { btn } from './sim/ui';
	let { characterKey = '', loadout, state: simState, onrestore }: { characterKey?: string; loadout: Loadout; state: SimState; onrestore: (state: SimState) => void } = $props();
	let name = $state('');
	let list = $state<SavedSimulation[]>([]);
	let note = $state('');
	let fileInput: HTMLInputElement;
	$effect(() => { void characterKey; void loadout; untrack(() => { list = savedSimulations(characterKey); name = latestSimulation(characterKey, loadout)?.name ?? ''; note = ''; }); });
	function save() {
		try { saveSimulation(characterKey, name, loadout, $state.snapshot(simState)); list = savedSimulations(characterKey); note = 'Saved in this browser. Your latest save reopens with this character snapshot.'; }
		catch (e) { note = (e as Error).message; }
	}
	function restore(s: SavedSimulation) {
		if (!sameBaseline(s.loadout, loadout)) { note = 'This plan uses a different starting snapshot. Select its original character snapshot before restoring it.'; return; }
		onrestore(structuredClone($state.snapshot(s.state))); name = s.name; note = `Restored ${s.name}.`;
	}
	function remove(id: string) {
		try { deleteSimulation(id); list = savedSimulations(characterKey); note = 'Saved plan deleted.'; } catch (e) { note = (e as Error).message; }
	}
	function exportFile() {
		const s = { version: 1, id: crypto.randomUUID(), name: name.trim() || 'My plan', characterKey, savedAt: Date.now(), loadout, state: $state.snapshot(simState) };
		const url = URL.createObjectURL(new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' }));
		const a = document.createElement('a'); a.href = url; a.download = 'loa-sim-plan.json'; a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
		note = 'Exported character snapshot and edits. You can keep or share this file.';
	}
	async function importFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0]; if (!file) return;
		try {
			if (file.size > 2_000_000) throw new Error('This simulation file is too large.');
			const s = parseSimulation(await file.text());
			if (s.characterKey.toLowerCase() !== characterKey.toLowerCase()) throw new Error('Open this file’s character before importing its plan.');
			restore(s);
		} catch (e) { note = (e as Error).message; }
		input.value = '';
	}
</script>

<details class="mb-2 min-w-0 shrink-0 rounded-xs border border-accent-500/50 bg-accent-500/10 p-2">
	<summary class="cursor-pointer text-sm font-semibold text-accent-200">Saved simulations{#if list.length} · {list.length}{/if}</summary>
	<p class="my-2 text-xs text-surface-400">Save your edits before leaving. Saved plans stay separate from real gear snapshots. Export a file to back up or share a plan.</p>
	<div class="flex flex-wrap items-center gap-2">
		<label class="flex w-full min-w-0 flex-col gap-1 text-xs text-surface-300">Plan title
			<input aria-label="Simulation name" bind:value={name} maxlength="80" placeholder="e.g. Gear for the next raid" class="h-8 min-w-0 w-full rounded-xs border border-surface-600 bg-surface-800 px-2 text-sm" />
		</label>
		<button type="button" class={btn} onclick={save} disabled={!characterKey}>Save changes</button>
		<button type="button" class={btn} onclick={exportFile} disabled={!characterKey}>Export</button>
		<button type="button" class={btn} onclick={() => fileInput.click()} disabled={!characterKey}>Import</button>
		<input bind:this={fileInput} type="file" accept="application/json,.json" class="hidden" onchange={importFile} aria-label="Import simulation file" />
	</div>
	{#if note}<p class="mt-2 text-xs text-surface-200" role="status">{note}</p>{/if}
	{#each list as s (s.id)}
		<div class="mt-2 flex items-center gap-2 text-xs">
			<button type="button" class="flex min-w-0 flex-1 flex-col text-left text-accent-300 hover:underline" onclick={() => restore(s)} title={`Restore ${s.name}`}>
				<span class="w-full truncate font-semibold">{s.name}</span>
				<span class="text-[10px] text-surface-400">{new Date(s.savedAt).toLocaleString()}</span>
			</button>
			<button type="button" class={btn} onclick={() => remove(s.id)} aria-label={`Delete ${s.name}`}>Delete</button>
		</div>
	{/each}
</details>
