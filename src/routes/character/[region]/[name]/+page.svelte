<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import CharacterSkeleton from '$lib/character/CharacterSkeleton.svelte';
	import CharacterView from '$lib/character/CharacterView.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.name} ({data.region}) | loa-sim</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#await data.character}
	<CharacterSkeleton name={data.name} region={data.region} />
{:then result}
	{#if 'error' in result}
		<div class="space-y-3 text-sm">
			<p role="alert" class="text-red-400">{result.error}</p>
			<button type="button" class="text-surface-200 underline hover:text-surface-50" onclick={() => invalidateAll()}>Try again</button>
			<a href="/" class="ml-4 text-surface-300 underline hover:text-surface-50">Choose a character</a>
		</div>
	{:else}
		{@const c = result.data}
		<CharacterView name={c.name} region={c.region} subtitle={c.header?.guild?.name ?? ''} itemLevel={c.header?.ilvl} loadout={c.loadout} cpDistribution={c.cpDistribution} />
	{/if}
{/await}
