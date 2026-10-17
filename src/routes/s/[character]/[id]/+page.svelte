<script lang="ts">
	import CharacterView from '$lib/character/CharacterView.svelte';
	import { normalizeName } from '$lib/bible-data';
	let {data} = $props();
	const plan = $derived(data.shared.plan);
	const region = $derived(plan.characterKey.split('/')[0].toUpperCase());
	const name = $derived(normalizeName(plan.characterKey.split('/')[1]));
</script>

<svelte:head><title>{name} — shared simulation | loa-sim</title><meta name="robots" content="noindex,nofollow" /></svelte:head>
<div class="mb-4 rounded-xs border border-accent-500/30 bg-surface-900 p-3 text-sm">
	<p class="font-semibold text-accent-200">Shared simulation: {plan.name}</p>
	<p class="mt-1 text-surface-300">Shared CP: {data.shared.originalCp.toFixed(2)} · Expires {new Date(data.shared.expiresAt).toLocaleDateString()}</p>
</div>
{#key plan.id}
	<CharacterView initialBuild={plan} sharedBuild {name} {region} loadout={plan.loadout} itemLevel={plan.loadout.itemLevel} subtitle={`Shared ${new Date(plan.savedAt).toLocaleDateString()}`} />
{/key}
