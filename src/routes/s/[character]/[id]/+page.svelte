<script lang="ts">
	import CharacterView from '$lib/character/CharacterView.svelte';
	import { normalizeName } from '$lib/bible-data';
	import { formatDate } from '$lib/upgrade-planner/format';
	let {data} = $props();
	const plan = $derived(data.shared.plan);
	const region = $derived(plan.characterKey.split('/')[0].toUpperCase());
	const name = $derived(normalizeName(plan.characterKey.split('/')[1]));
 const cp = $derived(data.shared.calculatedCp ?? data.shared.originalCp);
</script>

<svelte:head><title>{name} — shared simulation | loa-sim</title><meta name="robots" content="noindex,nofollow" /></svelte:head>
<div class="mb-4 rounded-xs border border-accent-500/30 bg-surface-900 p-3 text-sm">
	<p class="font-semibold text-accent-200">Shared simulation: {plan.name}</p>
	<p class="mt-1 text-surface-300">Shared CP: {cp.toFixed(2)} · Expires {formatDate(data.shared.expiresAt)}</p>
	{#if Math.abs(cp - data.shared.originalCp) > 0.01}<p class="mt-1 text-xs text-surface-400">Recorded when shared: {data.shared.originalCp.toFixed(2)} CP. Recalculated using the current simulator.</p>{/if}
</div>
{#key plan.id}
	<CharacterView initialBuild={plan} sharedBuild {name} {region} loadout={plan.loadout} itemLevel={plan.loadout.itemLevel} subtitle={`Shared ${formatDate(plan.savedAt)}`} />
{/key}
