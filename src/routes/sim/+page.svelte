<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import CharacterView from '$lib/demo/CharacterView.svelte';
	import { loadSavedCharacter } from '$lib/saved-character';
	import { onMount } from 'svelte';

	// ?c=na/soulshan picks a saved character; without it, the most recently loaded one.
	const saved = $derived(loadSavedCharacter(page.url.searchParams.get('c')));

	onMount(() => {
		if (!saved) goto('/', { replaceState: true });
	});

	const subtitle = $derived(
		saved ? [saved.header?.guild?.name ?? '', `Snapshot loaded ${new Date(saved.savedAt).toLocaleString()}`] : []
	);
</script>

{#if saved}
	{#key `${saved.region}/${saved.name}`}
		<CharacterView name={saved.name} region={saved.region} {subtitle} itemLevel={saved.header?.ilvl} loadout={saved.loadout} cpDistribution={saved.cpDistribution} />
	{/key}
{/if}
