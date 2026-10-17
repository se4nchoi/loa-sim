<script lang="ts">
	import CharacterView from '$lib/character/CharacterView.svelte';

	let { data } = $props();
	const subtitle = $derived(data.header?.guild?.name ?? '');
</script>

<CharacterView name={data.name} region={data.region} {subtitle} itemLevel={data.header?.ilvl} loadout={data.loadout} cpDistribution={data.cpDistribution} />
