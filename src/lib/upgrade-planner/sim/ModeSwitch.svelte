<!-- CP / DPS: the same simulator; DPS adds a clear from the player's logs and its meter. -->
<script lang="ts">
	import Segmented from './Segmented.svelte';

	let { dpsMode, onmode }: { dpsMode: boolean; onmode: (mode: 'cp' | 'dps') => void } = $props();
</script>

<Segmented
	label="Simulate"
	value={dpsMode ? 'dps' : 'cp'}
	options={[{ value: 'cp', label: 'CP' }, { value: 'dps', label: 'DPS', badge: 'Beta', title: 'Replay one of your own clears from LOA Logs with your edits' }]}
	onselect={onmode}
	size="h-8 min-w-14 px-3 text-sm"
/>
