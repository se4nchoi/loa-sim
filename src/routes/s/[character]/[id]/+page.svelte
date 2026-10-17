<script lang="ts">
	import CharacterView from '$lib/demo/CharacterView.svelte';
	import { normalizeName } from '$lib/bible-data';
	let {data} = $props();
	const plan = $derived(data.shared.plan);
	const region = $derived(plan.characterKey.split('/')[0].toUpperCase());
	const name = $derived(normalizeName(plan.characterKey.split('/')[1]));
</script>

<svelte:head><title>{name} — shared simulation | loa-sim</title><meta name="robots" content="noindex,nofollow" /></svelte:head>
<div class="mb-4 rounded-xs border border-accent-500/30 bg-surface-900 p-3 text-sm">
	<p class="font-semibold text-accent-200">Shared simulation: {plan.name}</p>
	<p class="mt-1 text-surface-300">Original shared result: {data.shared.originalCp.toFixed(2)} CP · Link expires {new Date(data.shared.expiresAt).toLocaleDateString()}</p>
	<p class="mt-1 text-xs text-surface-400">The original gear and proposed changes are loaded. You can keep experimenting here.</p>
</div>
{#key plan.id}
	<CharacterView initialBuild={plan} sharedBuild {name} {region} loadout={plan.loadout} itemLevel={plan.loadout.itemLevel} subtitle={`Shared ${new Date(plan.savedAt).toLocaleDateString()}`} />
{/key}
