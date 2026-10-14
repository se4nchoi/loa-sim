<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { loadAutosave, deleteSimulation, parseSimulation, sameBaseline, savedSimulations, saveSimulation, type SavedSimulation } from './saved-simulations';
	import { initSimState, simulate, type SimState } from './simulate';
	import type { Loadout } from './types';
	import { btn, type MenuOption } from './sim/ui';
	import MenuPicker from './sim/MenuPicker.svelte';
	let { characterKey = '', loadout, state: simState, onrestore }: { characterKey?: string; loadout: Loadout; state: SimState; onrestore: (state: SimState) => void } = $props();
	let name = $state('');
	let selected = $state('');
	let naming = $state<string | null>(null);
	let list = $state<SavedSimulation[]>([]);
	let note = $state('');
	let fileInput: HTMLInputElement;
	let working = $state<SimState>();
	$effect(() => {
		const key = characterKey, baseline = loadout;
		void $state.snapshot(simState);
		let cancelled = false;
		void tick().then(() => { if (!cancelled) working = loadAutosave(key, baseline); });
		return () => { cancelled = true; };
	});
	$effect(() => { void characterKey; void loadout; untrack(() => { list = savedSimulations(characterKey); selected = ''; name = ''; note = ''; }); });
	const shortDay = (at: number) => {
		const d = new Date(at);
		return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	};
	const options = $derived.by<MenuOption<string>[]>(() => [
		...(working ? [
			{ value: 'autosave', label: 'Autosaved simulation', marker: '', onsave: saveNamed, title: 'Your current working copy, saved automatically in this browser' }
		] : []),
		...list.map(s => {
			const base = initSimState(s.loadout);
			const baseline = simulate(s.loadout, base, base).cp;
			const cp = (s.loadout.combatPower?.score ?? baseline) * simulate(s.loadout, s.state, base).cp / baseline;
			const compatible = sameBaseline(s.loadout, loadout);
			return { value: s.id, label: s.name, note: shortDay(s.savedAt),
				detail: { label: cp.toFixed(2), color: s.loadout.combatPower?.id === 2 ? 'var(--color-green-400)' : 'var(--color-red-400)' }, marker: '', disabled: !compatible,
				title: compatible ? s.name : 'Select this plan’s original character snapshot before loading it.',
				onremove: () => remove(s.id), removeLabel: `Delete ${s.name}` };
		}),
		...(list.length || working ? [] : [{ value: 'hint', label: 'No saved simulations yet', disabled: true, muted: true, marker: '' }])
	]);
	const active = $derived(list.find(s => s.id === selected && JSON.stringify(s.state) === JSON.stringify(simState)));
	const menuValue = $derived(active?.id ?? (working ? 'autosave' : ''));
	function saveNamed(title: string): boolean {
		try { const s = saveSimulation(characterKey, title, loadout, $state.snapshot(simState)); list = savedSimulations(characterKey); selected = s.id; name = s.name; note = ''; return true; }
		catch (e) { note = (e as Error).message; return false; }
	}
	function restore(s: SavedSimulation) {
		if (!sameBaseline(s.loadout, loadout)) { note = 'This plan uses a different starting snapshot. Select its original character snapshot before restoring it.'; return; }
		onrestore(structuredClone($state.snapshot(s.state))); selected = list.some(plan => plan.id === s.id) ? s.id : ''; name = s.name; note = '';
	}
	function pick(id: string) {
		if (id === 'autosave') { if (working) onrestore(structuredClone($state.snapshot(working))); selected = ''; name = ''; return; }
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
	// A file imported on Characters explicitly loads its edits before autosave resumes.
	onMount(async () => {
		let imported: SavedSimulation | undefined;
		try { const id = sessionStorage.getItem('loa-sim:import-plan'); imported = list.find(s => s.id === id); if (imported) sessionStorage.removeItem('loa-sim:import-plan'); } catch { /* storage blocked */ }
		if (imported) { await tick(); restore(imported); }
	});
</script>

<div class="min-w-0">
	<div class="grid min-w-0 grid-cols-[minmax(0,1fr)_repeat(2,2rem)] items-center gap-1.5">
		<div class="min-w-0 flex-1">
			<MenuPicker value={menuValue} {options} onpick={pick} label="Saved simulation to load" tone="purple" repick full fitMenu bind:naming>
				{#snippet trigger()}<span class="min-w-0 truncate text-xs">{active?.name ?? (working ? 'Autosaved simulation' : 'Saved simulations')}</span>{/snippet}
			</MenuPicker>
		</div>
		<button type="button" class={`${btn} shrink-0`} style:height="2rem" style:width="2rem" style:padding="0" onclick={exportFile} aria-label="Export" title="Export simulation JSON" disabled={!characterKey}>
			<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></svg>
		</button>
		<button type="button" class={`${btn} shrink-0`} style:height="2rem" style:width="2rem" style:padding="0" onclick={() => fileInput.click()} aria-label="Import" title="Import simulation JSON" disabled={!characterKey}>
			<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></svg>
		</button>
		<input bind:this={fileInput} type="file" accept="application/json,.json" class="hidden" onchange={importFile} aria-label="Import simulation file" />
	</div>
	{#if note}<p class="mt-2 text-xs text-red-300" role="alert">{note}</p>{/if}
</div>
