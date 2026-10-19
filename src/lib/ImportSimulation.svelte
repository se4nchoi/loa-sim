<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
 import { importSimulation } from '$lib/import-simulation';
	let input: HTMLInputElement;
	let error = $state('');
	let ready = $state(false);
	onMount(() => { ready = true; });
	async function importFile(e: Event) {
		const control = e.currentTarget as HTMLInputElement;
		const file = control.files?.[0]; if (!file) return;
		try {
			if (file.size > 2_000_000) throw new Error('This simulation file is too large.');
   await goto(importSimulation(await file.text()));
		} catch (e) { error = (e as Error).message; }
		control.value = '';
	}
</script>

<div class="text-xs">
	<button type="button" disabled={!ready} class="text-accent-300 underline underline-offset-2 hover:text-accent-200 disabled:opacity-50" onclick={() => input.click()}>Or import from a loa-sim simulation file</button>
	<input bind:this={input} type="file" accept="application/json,.json" class="hidden" aria-label="Import shared simulation" onchange={importFile} />
	{#if error}<p class="mt-1 text-red-300" role="alert">{error}</p>{/if}
</div>
