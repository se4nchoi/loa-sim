<!--
	The DPS sim's limits, in one fold under the meter: the question it answers, what this run's meter leaves out (from
	the meter), then what always holds. Short facts, one per line; the fold says how many are about this run.
-->
<script lang="ts">
	let { support = false, notIn = [], notes = [] }: {
		support?: boolean;
		/** Edits this run's meter doesn't count (still in CP). */
		notIn?: string[];
		/** The meter's notes for this run. */
		notes?: string[];
	} = $props();

	const runCount = $derived((notIn.length ? 1 : 0) + notes.length);
	const question = $derived(support
		? 'If you played this run exactly the same with these edits, how much would your buffs add?'
		: 'If you played this run exactly the same with these edits, what would your DPS be?');
	const always = $derived(support
		? [
			'Kept as recorded: dealers’ damage, uptime and fight length.',
			'Buffs scale with their stat. Ark Passive party buffs and orbs stay as recorded.',
			'Same gear, run to run: ±10–20%. Most single upgrades: under 2%.'
		]
		: [
			'Kept as recorded: casts, rotation, crits, buffs and fight length.',
			'Same gear, run to run: ±10–20%. Most single upgrades: under 2%.',
			'Not valued: Order core swaps, Paradise orb swaps, Evolution Karma, stacking or timed effects, summons and DoTs.',
			'Cooldown gems add casts only where the run had the skill on cooldown.',
			'Uptime, positionals and staying alive often matter more than gear, and cost nothing.'
		]);
</script>

<details class="mt-3 rounded-xs border border-surface-700 bg-surface-950/50 text-xs">
	<summary class="flex cursor-pointer items-center gap-2 px-3 py-2 select-none hover:bg-surface-800/40">
		<span class="text-sm font-semibold text-surface-100">Limits</span>
		{#if runCount}<span class="text-amber-300">※ {runCount} on this run</span>{/if}
	</summary>
	<div class="space-y-2 px-3 pb-3">
		<p class="text-sm font-semibold text-surface-50">{question}</p>
		{#if runCount}
			<ul class="space-y-0.5 text-amber-200/90">
				{#if notIn.length}<li title="Still counted in CP">Not counted: {notIn.join(', ')}</li>{/if}
				{#each notes as note (note)}<li>{note}</li>{/each}
			</ul>
		{/if}
		<ul class="list-disc space-y-0.5 pl-4 text-surface-300">
			{#each always as line (line)}<li>{line}</li>{/each}
		</ul>
	</div>
</details>
