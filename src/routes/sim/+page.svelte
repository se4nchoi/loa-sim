<script lang="ts">
	import { goto } from '$app/navigation';
	import CharacterView from '$lib/demo/CharacterView.svelte';
	import { loadSavedCharacter } from '$lib/saved-character';
	import { onMount } from 'svelte';

	const saved = loadSavedCharacter();

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
	<div class="mb-2 text-right text-sm">
		<a class="text-surface-300 underline hover:text-surface-50" href={`/?region=${saved.region}&name=${encodeURIComponent(saved.name)}`}>
			Reload or load a different character
		</a>
	</div>
	<CharacterView name={saved.name} region={saved.region} {subtitle} loadout={saved.loadout} />
{/if}
