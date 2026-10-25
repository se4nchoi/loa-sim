<script lang="ts">
	let { locked = false }: { locked?: boolean } = $props();
	const label = $derived(locked ? 'Vambraces · Requires item level 1750' : 'Vambraces · Not equipped');
</script>

<img
	class="size-10 shrink-0"
	src={locked ? '/slots/equipment-locked.png' : '/slots/vambrace-empty.png'}
	alt={label}
	title={label}
	width="40"
	height="40"
/>
