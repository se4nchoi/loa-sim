<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { pinSimulation, renameSimulation, loadAutosave, deleteSimulation, sameBaseline, savedSimulations, saveSimulation, type SavedSimulation } from './saved-simulations';
	import { initSimState, simulate, type SimState } from './simulate';
	import type { Loadout } from './types';
	import type { MenuOption } from './sim/ui';
	import MenuPicker from './sim/MenuPicker.svelte';
	let { characterKey = '', initialId = '', workspaceKey, loadout, state: simState, onrestore }: { characterKey?: string; initialId?: string; workspaceKey?: string; loadout: Loadout; state: SimState; onrestore: (state: SimState) => void } = $props();
	let name = $state('');
	let selected = $state('');
	let naming = $state<string | null>(null);
	let list = $state<SavedSimulation[]>([]);
	let note = $state('');
	let feedback = $state('');
	let working = $state<SimState>();
	$effect(() => {
		const key = workspaceKey ?? characterKey, baseline = loadout;
		void $state.snapshot(simState);
		let cancelled = false;
		void tick().then(() => { if (!cancelled) working = loadAutosave(key, baseline); });
		return () => { cancelled = true; };
	});
	$effect(() => { void characterKey; void loadout; untrack(() => { list = savedSimulations(characterKey); selected = initialId; name = list.find(s => s.id === initialId)?.name ?? ''; note = ''; feedback = ''; }); });
	const shortDay = (at: number) => {
		const d = new Date(at);
		return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	};
	const options = $derived.by<MenuOption<string>[]>(() => [
		...(working ? [
			{ value: 'autosave', label: 'Current simulation', marker: '', onsave: saveNamed, title: 'Your current working copy, saved automatically in this browser' }
		] : []),
		...list.map(s => {
			const base = initSimState(s.loadout);
			const baseline = simulate(s.loadout, base, base).cp;
			const cp = (s.loadout.combatPower?.score ?? baseline) * simulate(s.loadout, s.state, base).cp / baseline;
			const compatible = sameBaseline(s.loadout, loadout);
			return { value: s.id, label: s.name, note: shortDay(s.savedAt),
				detail: { label: cp.toFixed(2), color: s.loadout.combatPower?.id === 2 ? 'var(--color-green-400)' : 'var(--color-red-400)' }, marker: '', loadDisabled: !compatible,
				title: compatible ? s.name : 'Select this plan’s original character snapshot before loading it.',
				pinned: s.pinned === true, onpin: () => togglePin(s.id), onrename: (title: string) => rename(s.id, title), onload: () => restore(s), onremove: () => remove(s.id), removeLabel: `Delete ${s.name}` };
		}),
		...(list.length || working ? [] : [{ value: 'hint', label: 'No saved simulations yet', disabled: true, muted: true, marker: '' }])
	]);
	const active = $derived(list.find(s => s.id === selected && JSON.stringify(s.state) === JSON.stringify(simState)));
	const menuValue = $derived(active?.id ?? (working ? 'autosave' : ''));
	function saveNamed(title: string): boolean {
		try { const prior = new Set(list.map(s => s.id)); const s = saveSimulation(characterKey, title, loadout, $state.snapshot(simState)); list = savedSimulations(characterKey); selected = s.id; name = s.name; note = ''; feedback = prior.has(s.id) ? 'Already saved—no changes.' : ''; return true; }
		catch (e) { note = (e as Error).message; return false; }
	}
	function rename(id: string, title: string): boolean {
		try { renameSimulation(id, title); list = savedSimulations(characterKey); if (selected === id) name = title.trim(); note = ''; feedback = ''; return true; }
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
function togglePin(id = selected) {
 const plan = list.find(s => s.id === id); if (!plan) return;
 try { pinSimulation(plan.id, !plan.pinned); list = savedSimulations(characterKey); note = ''; }
 catch (e) { note = (e as Error).message; }
}
</script>

<div class="min-w-0">
	<div class="min-w-0">
		<div class="min-w-0 flex-1">
			<MenuPicker value={menuValue} {options} onpick={pick} label="Saved simulation to load" tone="purple" repick full bind:naming>
				{#snippet trigger()}<span class="min-w-0 truncate text-xs max-sm:text-base">{active?.name ?? (working ? 'Current simulation' : 'Saved simulations')}</span>{/snippet}
			</MenuPicker>
		</div>

	</div>
	{#if feedback}<p class="mt-2 text-xs text-surface-400" role="status">{feedback}</p>{/if}
	{#if note}<p class="mt-2 text-xs text-red-300" role="alert">{note}</p>{/if}
</div>
