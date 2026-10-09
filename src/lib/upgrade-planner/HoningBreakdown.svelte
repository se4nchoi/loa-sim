<script lang="ts">
	import { onMount } from 'svelte';
	import { materialIcon, materialName, type HoningCost } from './honing-cost';
	import { iconUrl } from './icons';
	import { btn, btnAccent } from './sim/ui';
	let { cost, title, manualCost, onclose }: { cost: HoningCost; title: string; manualCost?: number; onclose: () => void } = $props();
	let dialog: HTMLDialogElement;
	let mode = $state<'average' | 'pity'>('average');
	const details = $derived(cost.breakdown?.[mode]);
	const quantity = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });
	const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
	onMount(() => dialog.showModal());
</script>

<dialog bind:this={dialog} {onclose} onclick={(e) => { e.stopPropagation(); if (e.target === dialog) dialog.close(); }} aria-label="Honing material breakdown" class="m-auto max-h-[85vh] w-[640px] max-w-[calc(100vw-1.5rem)] rounded-sm border border-surface-700 bg-surface-900 p-0 text-surface-100 backdrop:bg-black/60">
	<div class="flex items-start gap-3 border-b border-neutral-950 px-4 py-3">
		<div class="min-w-0 flex-1">
			<h2 class="font-semibold">Honing material breakdown</h2>
			<p class="mt-1 text-xs text-surface-400">{title}</p>
		</div>
		<button type="button" class={btn} onclick={() => dialog.close()} aria-label="Close material breakdown">Close</button>
	</div>
	<div class="space-y-3 p-4">
		{#if manualCost !== undefined}<p class="text-xs text-amber-200">Your entered total ({money(manualCost)} gold) overrides the estimate for ranking. This breakdown shows the calculated material estimate.</p>{/if}
		<div class="flex flex-wrap items-center gap-2">
			<button type="button" class={mode === 'average' ? btnAccent : btn} aria-pressed={mode === 'average'} onclick={() => (mode = 'average')}>Average</button>
			<button type="button" class={mode === 'pity' ? btnAccent : btn} aria-pressed={mode === 'pity'} onclick={() => (mode = 'pity')}>Pity</button>
			<span class="ml-auto text-xs text-surface-400">{quantity(mode === 'average' ? cost.taps : cost.maxTaps)} taps</span>
		</div>
		{#if details}
			<div class="overflow-x-auto">
				<table class="w-full text-xs tabular-nums">
					<thead class="text-surface-400"><tr class="border-b border-surface-700"><th class="py-2 text-left font-normal">Material</th><th class="px-2 py-2 text-right font-normal">Bound used</th><th class="px-2 py-2 text-right font-normal">Market buy</th><th class="py-2 text-right font-normal">Market gold</th></tr></thead>
					<tbody>
						{#each details.materials as material (material.id)}
							{@const icon = materialIcon(material.id)}
							<tr class="border-b border-surface-800">
								<th scope="row" class="py-2 text-left font-normal"><span class="flex items-center gap-1.5">{#if icon}<img src={iconUrl(icon)} alt="" class="size-5 shrink-0" />{/if}{materialName(material.id)}</span></th>
								<td class="px-2 py-2 text-right text-surface-300">{quantity(material.bound)}</td>
								<td class="px-2 py-2 text-right">{quantity(material.bought)}</td>
								<td class="py-2 text-right text-amber-200" title={`${money(material.price)} gold per unit`}>{money(material.gold)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="space-y-1 text-xs tabular-nums">
				<p class="flex justify-between gap-3 text-surface-400"><span>Honing fees</span><span>{money(details.tapGold)}</span></p>
				<p class="flex justify-between gap-3 text-surface-400"><span>Market materials</span><span>{money(details.materials.reduce((sum, m) => sum + m.gold, 0))}</span></p>
				<p class="flex justify-between gap-3 border-t border-surface-700 pt-2 font-semibold text-amber-200"><span>Total gold</span><span>{money(mode === 'average' ? cost.expected : cost.worst)}</span></p>
			</div>
		{/if}
		<p class="text-xs text-surface-400">{mode === 'average' ? 'Average quantities are weighted across possible outcomes; bound materials are used first in each outcome.' : 'Pity assumes every try fails until the next try is guaranteed.'} This is an estimate for this upgrade; it does not deduct materials from your saved inventory.</p>
		<p class="text-xs text-surface-400">{cost.breath ? `Uses full ${cost.breathLabel} on each tap.` : 'No breath used.'} Both views use the cheapest average strategy. Market gold uses your entered prices; unset prices count as 0.</p>
	</div>
</dialog>
