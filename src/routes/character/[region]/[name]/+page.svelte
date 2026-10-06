<script lang="ts">
	import CharacterView from '$lib/demo/CharacterView.svelte';

	let { data } = $props();
	const subtitle = $derived(
		[data.header?.ilvl && `Item Level ${data.header.ilvl.toFixed(2)}`, data.header?.guild?.name].filter(Boolean).join(' · ')
	);
</script>

<CharacterView name={data.name} region={data.region} {subtitle} loadout={data.loadout} />
