<!-- CP / DPS: the same simulator; DPS adds a clear from the player's logs and its meter. -->
<script lang="ts">
	import ReportDialog from '$lib/ReportDialog.svelte';
	import Segmented from './Segmented.svelte';
	import Spinner from './Spinner.svelte';
	import { btn } from './ui';

	let { dpsMode, onmode }: { dpsMode: boolean; onmode: (mode: 'cp' | 'dps') => void } = $props();

	// Opening the other mode takes a moment (DPS replays the run for every upgrade): the spinner shows at once, and the
	// switch happens on the next frame so it has painted first.
	let pending = $state<'cp' | 'dps' | null>(null);
	$effect(() => {
		if (pending && (pending === 'dps') === dpsMode) pending = null;
	});
	// DPS is in beta: a note floats under the switch while it's on, asking players to report odd numbers, until they
	// close it (remembered in this browser). It floats, so the page doesn't move when it shows or goes.
	const BETA_NOTE_KEY = 'loa-sim:dps-beta-note:v1';
	let noteClosed = $state(true);
	$effect(() => {
		try { noteClosed = localStorage.getItem(BETA_NOTE_KEY) !== null; } catch { noteClosed = false; }
	});
	// Closed, it comes back while the mouse is over the switch (or the note itself), so Report stays findable. Mouse only:
	// a tap on a phone would leave it showing.
	let hovering = $state(false);
	const hover = (on: boolean) => (e: PointerEvent) => { if (e.pointerType === 'mouse') hovering = on; };
	function closeNote() {
		noteClosed = true;
		hovering = false;
		try { localStorage.setItem(BETA_NOTE_KEY, '1'); } catch { /* shows again next visit */ }
	}
	let reporting = $state(false);

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

<div class="relative" role="group" aria-label="Simulate" aria-busy={!!pending} onpointerenter={hover(true)} onpointerleave={hover(false)}>
	{#if pending}<span class="absolute top-1/2 -left-6 -translate-y-1/2 max-sm:left-auto max-sm:-right-6" role="status" aria-label="Opening {pending === 'dps' ? 'the DPS sim' : 'CP'}"><Spinner /></span>{/if}
	<Segmented
		label="Simulate"
		value={pending ?? (dpsMode ? 'dps' : 'cp')}
		options={[{ value: 'cp', label: 'CP' }, { value: 'dps', label: 'DPS', badge: 'Beta', title: 'Replay one of your own clears from LOA Logs with your edits' }]}
		onselect={select}
		size="h-8 min-w-14 px-3 text-sm max-sm:h-7 max-sm:min-w-0 max-sm:px-2 max-sm:text-xs"
	/>
	{#if dpsMode && !pending && (!noteClosed || hovering)}
		<!-- pt-2, not a margin: the pointer crosses into the note without leaving the switch. -->
		<div class="absolute top-full right-0 z-40 pt-2">
		<div role="status" class="flex w-max max-w-[min(20rem,calc(100vw-2rem))] items-center gap-2 rounded-xs border border-amber-400/40 bg-surface-900 py-1.5 pr-1.5 pl-3 text-xs text-surface-200 shadow-lg shadow-black/50">
			<span class="font-semibold text-amber-300">Beta</span>
			<button type="button" class="{btn} h-7 px-2 text-xs" onclick={() => (reporting = true)}>Feels off ? Report it →</button>
			<button type="button" class="flex size-7 shrink-0 items-center justify-center rounded-xs text-surface-400 hover:bg-surface-800 hover:text-surface-50" onclick={closeNote} aria-label="Close" title="Close">×</button>
		</div>
		</div>
	{/if}
</div>
{#if reporting}<ReportDialog kind="data" onclose={() => (reporting = false)} />{/if}
