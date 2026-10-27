<!--
	Run-specific omissions stay beside the meter even after the first-look hint is dismissed.
-->
<script lang="ts">
	let { notIn = [], notes = [] }: {
		/** Edits this run's meter doesn't count (still in CP). */
		notIn?: string[];
		/** The meter's notes for this run. */
		notes?: string[];
	} = $props();

	const runCount = $derived((notIn.length ? 1 : 0) + notes.length);
</script>

{#if runCount}
<details class="mt-3 rounded-xs border border-amber-500/30 bg-amber-500/5 text-xs">
	<summary class="flex cursor-pointer items-center gap-2 px-3 py-2 select-none hover:bg-surface-800/40">
		<span class="text-sm font-semibold text-amber-200">{notIn.length ? 'Not counted in this run' : 'Run notes'}</span>
		<span class="text-amber-300">({runCount})</span>
	</summary>
	<div class="space-y-2 px-3 pb-3">
		<ul class="space-y-0.5 text-amber-200/90">
			{#if notIn.length}<li title="Still counted in CP">Not counted: {notIn.join(', ')}</li>{/if}
			{#each notes as note (note)}<li>{note}</li>{/each}
		</ul>
	</div>
</details>
{/if}
