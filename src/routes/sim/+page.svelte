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
		saved
			? [
					saved.header?.ilvl && `Item Level ${saved.header.ilvl.toFixed(2)}`,
					saved.header?.guild?.name,
					`snapshot loaded ${new Date(saved.savedAt).toLocaleString()}`
				]
					.filter(Boolean)
					.join(' · ')
			: ''
	);
</script>

{#if saved}
	{#key `${saved.region}/${saved.name}`}
		<CharacterView name={saved.name} region={saved.region} {subtitle} loadout={saved.loadout} />
	{/key}
{/if}
