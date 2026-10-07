<script lang="ts">
	import type { SimState } from '../simulate';
	import { ASTROGEM_COEFF, ASTROGEM_OPTION_NAMES } from '../tables';
	import type { CoreState } from '../upgrades';
	import SimCard from './SimCard.svelte';
	import { range, selectClass, type SectionDelta } from './ui';

	let {
		sim = $bindable(),
		base,
		cores,
		delta
	}: { sim: SimState; base: SimState; cores: CoreState[]; delta: SectionDelta } = $props();

	const dealerCores = $derived(cores.filter((c) => !c.info.supportOnly));
	const options = Object.keys(ASTROGEM_COEFF).map(Number);
	const inputClass = (changed: boolean) => `${selectClass(changed)} w-20 text-right`;
</script>

<SimCard title="Ark Grid" {delta}>
	{#if dealerCores.length === 0}
		<p class="text-sm text-surface-400">No ark grid cores equipped.</p>
	{:else}
		<div class="grid grid-cols-2 gap-x-6 gap-y-3 max-md:grid-cols-1">
			<div class="grid grid-cols-[1fr_max-content] items-center gap-x-3 gap-y-1">
				<span class="text-xs text-surface-400">Core</span>
				<span class="text-xs text-surface-400">Core points</span>
				{#each dealerCores as c (c.id)}
					<span class="text-sm text-surface-200">{c.label}</span>
					<select class={selectClass(sim.cores[c.id] !== base.cores[c.id])} bind:value={sim.cores[c.id]} aria-label={`${c.label} core points`}>
						{#each range(0, 20) as p (p)}<option value={p}>{p}P</option>{/each}
					</select>
				{/each}
			</div>
			<div class="grid grid-cols-[1fr_max-content] items-center gap-x-3 gap-y-1">
				<span class="text-xs text-surface-400">Astrogem option</span>
				<span class="text-xs text-surface-400">Total level</span>
				{#each options as id (id)}
					<label class="text-sm text-surface-200" for={`astro-${id}`}>{ASTROGEM_OPTION_NAMES[id]}</label>
					<input
						id={`astro-${id}`}
						type="number"
						min="0"
						max="120"
						class={inputClass(sim.astrogems[id] !== base.astrogems[id])}
						bind:value={sim.astrogems[id]}
					/>
				{/each}
				<span class="col-span-full mt-1 text-xs text-surface-400">Summed across every equipped astrogem.</span>
			</div>
		</div>
	{/if}
</SimCard>
