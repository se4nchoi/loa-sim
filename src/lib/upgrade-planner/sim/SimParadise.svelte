<script lang="ts">
	import { formatPct } from '../format';
	import { ORBS, orbName, orbValue } from '../paradise';
	import type { SimState } from '../simulate';
	import MenuPicker from './MenuPicker.svelte';
	import SimCard from './SimCard.svelte';
	import Stepper from './Stepper.svelte';
	import { btn, type PreviewEdit, type SectionDelta } from './ui';

	let { sim = $bindable(), base, preview, delta }: { sim: SimState; base: SimState; preview: PreviewEdit; delta: SectionDelta } = $props();

	const orb = $derived(sim.paradise);
	const k = $derived(orb ? (orb.orb === base.paradise?.orb ? base.paradise.k : (ORBS[orb.orb]?.k ?? orb.k)) : 0);
	/** The orb's own share of CP, in percent. */
	const share = $derived(orb ? (orb.flat ? 1.3 : orbValue(k, orb.power) / 100) : 0);
	const millions = (v: number) => `${(v / 1e6).toFixed(2)}M`;
	const choices = $derived(
		base.paradise
			? [...new Set([base.paradise.orb, ...Object.keys(ORBS).map(Number)])].map((id) => ({
					value: id,
					label: id === base.paradise!.orb ? orbName(base.paradise!) : ORBS[id].name
				}))
			: []
	);
</script>

{#if orb && base.paradise}
	<SimCard title="Paradise" {delta}>
		{#snippet actions()}
			<button type="button" class={btn} onclick={() => (sim.paradise = { ...base.paradise! })}>Reset</button>
		{/snippet}
		<div class="flex flex-row flex-wrap items-center gap-x-4 gap-y-2">
			{#if orb.flat}
				<div class="flex min-w-0 flex-col">
					<span class="text-sm font-semibold text-amber-200">{orbName(orb)}</span>
					<span class="text-xs text-surface-400">Support orb: {formatPct(share)}% CP at any Paradise power</span>
				</div>
			{:else}
				<div class="flex min-w-0 flex-col gap-1">
					<span class="text-xs text-surface-400">Orb</span>
					<MenuPicker
						value={orb.orb}
						options={choices}
						label="Paradise orb"
						changed={orb.orb !== base.paradise.orb}
						onpick={(v) => (sim.paradise = { ...orb, orb: v })}
						preview={(v) => preview((s) => (s.paradise = { ...s.paradise!, orb: v }))}
					>
						{#snippet trigger()}<span class="truncate text-sm font-semibold text-amber-200">{choices.find((c) => c.value === orb.orb)?.label}</span>{/snippet}
					</MenuPicker>
				</div>
				<div class="flex min-w-0 flex-col gap-1">
					<span class="text-xs text-surface-400">Paradise power <span class="text-surface-500">({millions(orb.power)})</span></span>
					<Stepper bind:value={sim.paradise!.power} min={0} max={999_999_999} step={1_000_000} changed={orb.power !== base.paradise.power} label="Paradise power" width="w-24" />
				</div>
				<div class="ml-auto flex flex-col text-right">
					<span class="text-xs text-surface-400">Orb</span>
					<span class="text-sm font-semibold tabular-nums">{formatPct(share)}% CP</span>
				</div>
			{/if}
		</div>
	</SimCard>
{/if}
