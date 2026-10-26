<!-- CP / DPS: the same simulator; DPS adds a clear from the player's logs and its meter. -->
<script lang="ts">
	import Segmented from './Segmented.svelte';
	import Spinner from './Spinner.svelte';

	let { dpsMode, onmode }: { dpsMode: boolean; onmode: (mode: 'cp' | 'dps') => void } = $props();

	// Opening the other mode takes a moment (DPS replays the run for every upgrade): the spinner shows at once, and the
	// switch happens on the next frame so it has painted first.
	let pending = $state<'cp' | 'dps' | null>(null);
	$effect(() => {
		if (pending && (pending === 'dps') === dpsMode) pending = null;
	});
	function select(mode: 'cp' | 'dps') {
		if ((mode === 'dps') === dpsMode || pending) return;
		pending = mode;
		// After the next paint; a hidden tab paints no frames, so a timer too, whichever comes first.
		let done = false;
		const go = () => { if (!done) { done = true; onmode(mode); } };
		requestAnimationFrame(() => setTimeout(go));
		setTimeout(go, 50);
	}
</script>

<div class="relative" aria-busy={!!pending}>
	{#if pending}<span class="absolute top-1/2 -left-6 -translate-y-1/2 max-sm:left-auto max-sm:-right-6" role="status" aria-label="Opening {pending === 'dps' ? 'the DPS sim' : 'CP'}"><Spinner /></span>{/if}
	<Segmented
		label="Simulate"
		value={pending ?? (dpsMode ? 'dps' : 'cp')}
		options={[{ value: 'cp', label: 'CP' }, { value: 'dps', label: 'DPS', badge: 'Beta', title: 'Replay one of your own clears from LOA Logs with your edits' }]}
		onselect={select}
		size="h-8 min-w-14 px-3 text-sm"
	/>
</div>
