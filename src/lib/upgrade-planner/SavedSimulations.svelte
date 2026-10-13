<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { deleteSimulation, parseSimulation, sameBaseline, savedSimulations, saveSimulation, type SavedSimulation } from './saved-simulations';
	import { initSimState, simulate, type SimState } from './simulate';
	import type { Loadout } from './types';
	import { btn, type MenuOption } from './sim/ui';
	import MenuPicker from './sim/MenuPicker.svelte';
	let { characterKey = '', loadout, state: simState, onrestore }: { characterKey?: string; loadout: Loadout; state: SimState; onrestore: (state: SimState) => void } = $props();
	let name = $state('');
	let selected = $state('');
	let saveOpen = $state(false);
	let list = $state<SavedSimulation[]>([]);
	let note = $state('');
	let fileInput: HTMLInputElement;
	$effect(() => { void characterKey; void loadout; untrack(() => { list = savedSimulations(characterKey); selected = ''; name = ''; note = ''; }); });
	const shortDay = (at: number) => {
		const d = new Date(at);
		return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	};
	const options = $derived.by<MenuOption<string>[]>(() => [
		...list.map(s => {
			const base = initSimState(s.loadout);
			const baseline = simulate(s.loadout, base, base).cp;
			const cp = (s.loadout.combatPower?.score ?? baseline) * simulate(s.loadout, s.state, base).cp / baseline;
			const compatible = sameBaseline(s.loadout, loadout);
			return { value: s.id, label: s.name, note: shortDay(s.savedAt),
				detail: { label: cp.toFixed(2), color: 'var(--color-violet-300)' }, marker: '', disabled: !compatible,
				title: compatible ? s.name : 'Select this plan’s original character snapshot before loading it.',
				onremove: () => remove(s.id), removeLabel: `Delete ${s.name}` };
		}),
		...(list.length ? [] : [{ value: 'hint', label: 'No saved simulations yet', disabled: true, muted: true, marker: '' }])
	]);
	const active = $derived(list.find(s => s.id === selected));
	function save() {
		try { const s = saveSimulation(characterKey, name, loadout, $state.snapshot(simState)); list = savedSimulations(characterKey); selected = s.id; saveOpen = false; note = ''; }
		catch (e) { note = (e as Error).message; }
	}
	function restore(s: SavedSimulation) {
		if (!sameBaseline(s.loadout, loadout)) { note = 'This plan uses a different starting snapshot. Select its original character snapshot before restoring it.'; return; }
		onrestore(structuredClone($state.snapshot(s.state))); selected = list.some(plan => plan.id === s.id) ? s.id : ''; name = s.name; note = '';
	}
	function pick(id: string) {
		const s = list.find(plan => plan.id === id); if (s) restore(s);
	}
	function remove(id: string) {
		try { deleteSimulation(id); list = savedSimulations(characterKey); if (selected === id) selected = ''; note = ''; } catch (e) { note = (e as Error).message; }
	}
	function exportFile() {
		const s = { version: 1, id: crypto.randomUUID(), name: name.trim() || 'My plan', characterKey, savedAt: Date.now(), loadout, state: $state.snapshot(simState) };
		const url = URL.createObjectURL(new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' }));
		const a = document.createElement('a'); a.href = url; a.download = 'loa-sim-plan.json'; a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000); note = '';
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
	// A file imported on Characters is an explicit load request, consumed once; refresh stays fresh.
	onMount(async () => {
		let imported: SavedSimulation | undefined;
		try { const id = sessionStorage.getItem('loa-sim:import-plan'); imported = list.find(s => s.id === id); if (imported) sessionStorage.removeItem('loa-sim:import-plan'); } catch { /* storage blocked */ }
		if (imported) { await tick(); restore(imported); }
	});
</script>

<div class="min-w-0">
	<div class="flex min-w-0 items-center gap-1.5">
		<div class="min-w-0 flex-1">
			<MenuPicker value={selected} {options} onpick={pick} label="Saved simulation to load" tone="purple" repick full>
				{#snippet trigger()}<span class="min-w-0 truncate text-xs">{active?.name ?? 'Saved simulations'}</span>{/snippet}
			</MenuPicker>
		</div>
		<button type="button" class={`${btn} shrink-0`} style:height="2rem" onclick={() => saveOpen = !saveOpen} aria-expanded={saveOpen} aria-label="Save simulation" disabled={!characterKey}>Save</button>
		<button type="button" class={`${btn} shrink-0`} style:height="2rem" onclick={exportFile} disabled={!characterKey}>Export</button>
		<button type="button" class={`${btn} shrink-0`} style:height="2rem" onclick={() => fileInput.click()} disabled={!characterKey}>Import</button>
		<input bind:this={fileInput} type="file" accept="application/json,.json" class="hidden" onchange={importFile} aria-label="Import simulation file" />
	</div>
	{#if saveOpen}
		<div class="mt-2 rounded-xs border border-surface-700 bg-surface-900 p-2">
			<p class="mb-2 text-xs text-surface-400">Current simulated snapshot will be saved as JSON in your browser.</p>
			<label class="flex min-w-0 flex-col gap-1 text-xs text-surface-300">Plan title
				<input aria-label="Simulation name" bind:value={name} maxlength="80" placeholder="e.g. Gear for the next raid" class="h-8 min-w-0 w-full rounded-xs border border-surface-600 bg-surface-800 px-2 text-sm" />
			</label>
			<button type="button" class={`${btn} mt-2`} onclick={save} disabled={!characterKey}>Save changes</button>
		</div>
	{/if}
	{#if note}<p class="mt-2 text-xs text-red-300" role="alert">{note}</p>{/if}
</div>
