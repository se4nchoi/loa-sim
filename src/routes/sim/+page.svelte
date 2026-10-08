<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import CharacterSwitcher from '$lib/CharacterSwitcher.svelte';
	import CharacterView from '$lib/demo/CharacterView.svelte';
	import type { LoadoutKind } from '$lib/bible-data';
	import { characterKey, loadSavedCharacter, rememberViewed, setLoadoutKind } from '$lib/saved-character';
	import { onMount } from 'svelte';

	// ?c=na/soulshan picks a saved character; without it (the Simulator tab), the one last viewed here.
	let switched = $state<ReturnType<typeof loadSavedCharacter>>(null);
	const wanted = $derived(page.url.searchParams.get('c'));
	// After a loadout switch, show the updated save, but only for the character it was made on.
	const saved = $derived(
		switched && (!wanted || characterKey(switched) === wanted.toLowerCase()) ? switched : loadSavedCharacter(wanted)
	);
	/** Estimated raid loadout ↔ latest raid snapshot; remembered for the character. */
	const onloadout = (kind: LoadoutKind) => {
		if (saved) switched = setLoadoutKind(characterKey(saved), kind) ?? switched;
	};

	$effect(() => {
		if (saved) rememberViewed(characterKey(saved));
	});

	onMount(() => {
		if (!saved) goto('/', { replaceState: true });
	});

	const subtitle = $derived(
		saved ? [saved.header?.guild?.name ?? '', `Snapshot loaded ${new Date(saved.savedAt).toLocaleString()}`] : []
	);
</script>

{#if saved}
	<CharacterSwitcher current={characterKey(saved)} />
	{#key `${saved.region}/${saved.name}`}
		<CharacterView name={saved.name} region={saved.region} {subtitle} itemLevel={saved.header?.ilvl} loadout={saved.loadout}
			cpDistribution={saved.cpDistribution}
			loadouts={saved.loadouts}
			loadoutKind={saved.loadoutKind}
			{onloadout}
		/>
	{/key}
{/if}
