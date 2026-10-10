<script lang="ts">
	import { formatPct } from '../format';
	import { iconUrl } from '../icons';
	import { formatPower, orbIcon, orbName, orbValue, parsePower } from '../paradise';
	import type { SimState } from '../simulate';
	import ItemIcon from './ItemIcon.svelte';
	import SimCard from './SimCard.svelte';
	import { btn, btnAccent, type SectionDelta } from './ui';

	let { sim = $bindable(), base, delta }: { sim: SimState; base: SimState; delta: SectionDelta } = $props();

	const orb = $derived(sim.paradise);
	/** The orb's own share of CP, in percent (supports: a flat 1.30%). */
	const share = $derived(orb && base.paradise ? (orb.flat ? 1.3 : orbValue(base.paradise.k, orb.power) / 100) : 0);

	// The box holds what the player is typing; it follows the simulation (Apply, Reset, undo) when that changes.
	let draft = $state('');
	$effect(() => {
		draft = formatPower(sim.paradise?.power ?? 0);
	});
	const typed = $derived(parsePower(draft));
	const canApply = $derived(typed !== null && !!orb && typed !== orb.power);
	function apply() {
		if (typed === null || !sim.paradise) return;
		sim.paradise = { ...sim.paradise, power: typed };
		draft = formatPower(typed);
	}
</script>

{#if orb && base.paradise}
	<SimCard title="Paradise" {delta} info="Only your snapshot's orb counts. Type any Paradise power to see what the orb would give.">
		{#snippet actions()}
			<button type="button" class={btn} onclick={() => (sim.paradise = { ...base.paradise! })}>Reset</button>
		{/snippet}
		<div class="flex flex-col gap-2.5">
			<div class="flex flex-row items-center gap-2.5">
				<ItemIcon src={iconUrl(orbIcon(orb.orb))} grade={6} title={orbName(orb.orb)} />
				<div class="flex min-w-0 flex-1 flex-col">
					<span class="truncate text-sm font-semibold text-amber-200">{orbName(orb.orb)}</span>
					<span class="text-xs text-surface-400 tabular-nums">Snapshot power {formatPower(base.paradise.power)}</span>
				</div>
				<div class="flex shrink-0 flex-col text-right">
					<span class="text-xs text-surface-400">Orb</span>
					<span class="text-sm font-semibold tabular-nums">{formatPct(share)}% CP</span>
				</div>
			</div>
			{#if orb.flat}
				<p class="text-xs text-surface-400">Support orb: a flat {formatPct(share)}% CP at any Paradise power.</p>
			{:else}
				<form
					class="flex flex-row items-center gap-2"
					onsubmit={(e) => {
						e.preventDefault();
						apply();
					}}
				>
					<label class="flex min-w-0 flex-1 flex-col gap-1">
						<span class="text-xs text-surface-400">Paradise power</span>
						<input
							type="text"
							inputmode="numeric"
							autocomplete="off"
							bind:value={draft}
							aria-label="Paradise power"
							aria-invalid={typed === null}
							class="h-8 w-full min-w-0 rounded-xs border bg-surface-950 px-2 text-sm tabular-nums text-surface-100 focus:border-accent-500 focus:outline-none {typed === null
								? 'border-red-500'
								: orb.power !== base.paradise.power
									? 'border-accent-500 bg-accent-500/10'
									: 'border-surface-700'}"
						/>
					</label>
					<button type="submit" class="{btnAccent} self-end" disabled={!canApply}>Apply</button>
				</form>
				{#if typed === null}<p class="-mt-1 text-xs text-red-400">Enter a number, e.g. 35,000,000 or 35m.</p>{/if}
			{/if}
		</div>
	</SimCard>
{/if}
