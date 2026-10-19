<!-- CP / DPS: the same simulator; DPS adds a clear from the player's logs and its meter. -->
<script lang="ts">
	import Segmented from './Segmented.svelte';

	let { dpsMode, onmode }: { dpsMode: boolean; onmode: (mode: 'cp' | 'dps') => void } = $props();
</script>

<div class="grid grid-cols-2 pb-0.5 text-center leading-none" aria-hidden="true">
	<span></span>
	<span><span class="rounded-xs bg-amber-500/15 px-1 text-[10px] font-semibold text-amber-300">Beta</span></span>
</div>
<Segmented
	label="Simulate"
	value={dpsMode ? 'dps' : 'cp'}
	options={[{ value: 'cp', label: 'CP' }, { value: 'dps', label: 'DPS', title: 'Replay one of your own clears from LOA Logs with your edits' }]}
	onselect={onmode}
	full
	size="h-8 px-3 text-sm"
/>
