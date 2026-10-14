<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { normalizeName } from '$lib/bible-data';
	import { saveCharacter, loadSavedCharacter, setLoadoutKind } from '$lib/saved-character';
	import { parseSimulation, sameBaseline, saveSimulation } from '$lib/upgrade-planner/saved-simulations';
	let input: HTMLInputElement;
	let error = $state('');
	let ready = $state(false);
	onMount(() => { ready = true; });
	async function importFile(e: Event) {
		const control = e.currentTarget as HTMLInputElement;
		const file = control.files?.[0]; if (!file) return;
		try {
			if (file.size > 2_000_000) throw new Error('This simulation file is too large.');
			const s = parseSimulation(await file.text());
			const [region, rawName] = s.characterKey.split('/');
			if (!['na', 'ce'].includes(region.toLowerCase()) || !rawName || s.characterKey.split('/').length !== 2) throw new Error('This file has an unsupported character region or name.');
			// Store the plan first: storage errors must prevent a misleading successful import.
			const plan = saveSimulation(s.characterKey, s.name, s.loadout, s.state);
			saveCharacter({ name: normalizeName(rawName), region: region.toUpperCase(), header: null, loadout: s.loadout, loadouts: { current: s.loadout }, loadoutKind: 'current' });
			setLoadoutKind(s.characterKey, 'current');
			const saved = loadSavedCharacter(s.characterKey);
			if (!saved?.loadout || !sameBaseline(saved.loadout, s.loadout)) throw new Error('Browser storage is blocked; the character could not be imported.');
			sessionStorage.setItem('loa-sim:import-plan', plan.id);
			await goto(`/sim?c=${encodeURIComponent(s.characterKey.toLowerCase())}`);
		} catch (e) { error = (e as Error).message; }
		control.value = '';
	}
</script>

<div class="text-xs">
	<button type="button" disabled={!ready} class="text-accent-300 underline underline-offset-2 hover:text-accent-200 disabled:opacity-50" onclick={() => input.click()}>Or import from a loa-sim simulation file</button>
	<input bind:this={input} type="file" accept="application/json,.json" class="hidden" aria-label="Import shared simulation" onchange={importFile} />
	{#if error}<p class="mt-1 text-red-300" role="alert">{error}</p>{/if}
</div>
