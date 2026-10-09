<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { breathStrategy, materialIcon, materialName, type HoningCost } from './honing-cost';
	import { GOLD_ICON, iconUrl } from './icons';
	import { btn, btnAccent } from './sim/ui';
	import { sheetDrag } from './sim/sheet-drag';
	let { cost, title, initialMode = 'average', onclose }: { cost: HoningCost; title: string; initialMode?: 'average' | 'pity'; onclose: () => void } = $props();
	let dialog: HTMLDialogElement;
	let mode = $state<'average' | 'pity'>(untrack(() => initialMode));
	const details = $derived(cost.breakdown?.[mode]);
	const tapCount = $derived(mode === 'average' ? cost.taps : cost.maxTaps);
	const strategies = $derived(cost.strategies ?? [{ label: breathStrategy(cost), materialIds: [], selected: true }]);
	const breathIds = $derived([...new Set(strategies.flatMap((strategy) => strategy.materialIds))]);
	const quantity = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });
	const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
	let card = $state<HTMLDivElement>();
	onMount(() => {
		dialog.showModal();
		dialog.focus(); // the dialog itself: no keyboard popping up, no focus ring
	});
</script>

<dialog bind:this={dialog} {onclose} onclick={(e) => { e.stopPropagation(); if (e.target === dialog) dialog.close(); }} aria-label="Honing material breakdown" tabindex="-1" class="m-auto max-h-[85vh] w-[640px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-sm border border-surface-700 bg-transparent p-0 text-surface-100 outline-none backdrop:bg-black/60 max-sm:mx-0 max-sm:mt-auto max-sm:mb-0 max-sm:w-full max-sm:max-w-full max-sm:rounded-none max-sm:border-0">
<!-- Phones: a bottom sheet; the header is the drag-to-close zone, with a grabber. -->
<div bind:this={card} class="flex max-h-[85vh] flex-col bg-surface-900 max-sm:rounded-t-xl max-sm:border-t max-sm:border-surface-700 max-sm:animate-[sheet-up_320ms_cubic-bezier(0.22,1,0.36,1)]">
	<div class="flex flex-wrap items-start gap-3 border-b border-neutral-950 px-4 py-3 max-sm:pt-2" use:sheetDrag={{ sheet: () => card, close: () => dialog.close(), slideOut: true, enabled: () => matchMedia('(max-width: 639px)').matches }}>
		<span class="mx-auto mb-1 block h-1.5 w-12 basis-full rounded-full bg-surface-500 sm:hidden" style="max-width:3rem"></span>
		<div class="min-w-0 flex-1">
			<h2 class="font-semibold">Honing material breakdown</h2>
			<p class="mt-1 text-xs text-surface-400">{title}</p>
		</div>
		<button type="button" class={btn} onclick={() => dialog.close()} aria-label="Close material breakdown">Close</button>
	</div>
	<div class="space-y-3 overflow-y-auto overscroll-contain p-4">
		<div class="flex flex-wrap items-center gap-2">
			<button type="button" class={mode === 'average' ? btnAccent : btn} aria-pressed={mode === 'average'} onclick={() => (mode = 'average')}>Average</button>
			<button type="button" class={mode === 'pity' ? btnAccent : btn} aria-pressed={mode === 'pity'} onclick={() => (mode = 'pity')}>Pity</button>
			<span class="ml-auto flex items-baseline gap-1.5"><span class="text-lg font-semibold text-accent-300 tabular-nums">{quantity(tapCount)}</span><span class="text-xs text-surface-200">taps</span></span>
		</div>
		{#if details}
			<div class="overflow-x-auto">
				<table class="w-full text-xs tabular-nums">
					<thead class="text-surface-400"><tr class="border-b border-surface-700"><th class="py-2 text-left font-normal">Material</th><th class="px-2 py-2 text-right font-normal">Per tap</th><th class="px-2 py-2 text-right font-normal">Bound used</th><th class="px-2 py-2 text-right font-normal">Market buy</th><th class="py-2 text-right font-normal">Gold spent</th></tr></thead>
					<tbody>
						<tr class="border-b border-surface-800" title="Gold paid directly across all taps">
							<th scope="row" class="py-2 text-left font-normal text-surface-300"><span class="flex items-center gap-1.5"><img src={GOLD_ICON} alt="" class="size-5 shrink-0" />Tap gold</span></th>
							<td class="px-2 py-2 text-right text-surface-400">{money(tapCount > 0 ? details.tapGold / tapCount : 0)}</td>
							<td class="px-2 py-2 text-right text-surface-400">—</td>
							<td class="px-2 py-2 text-right text-surface-400">—</td>
							<td class="py-2 text-right text-amber-200">{money(details.tapGold)}</td>
						</tr>
						{#each details.materials as material (material.id)}
							{@const icon = materialIcon(material.id)}
							<tr class="border-b border-surface-800">
								<th scope="row" class="py-2 text-left font-normal"><span class="flex items-center gap-1.5">{#if icon}<img src={iconUrl(icon)} alt="" class="size-5 shrink-0" />{/if}{materialName(material.id)}</span></th>
								<td class="px-2 py-2 text-right text-surface-400">{quantity(material.perTap)}{#if material.until !== undefined && cost.breathMode !== 'full'}<span class="block whitespace-nowrap text-[10px]">first {material.until} taps</span>{/if}</td>
								<td class="px-2 py-2 text-right text-surface-300">{quantity(material.bound)}</td>
								<td class="px-2 py-2 text-right">{quantity(material.bought)}</td>
								<td class="py-2 text-right text-amber-200" title={`${money(material.price)} gold per unit`}>{money(material.gold)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="space-y-1 text-xs tabular-nums">
				<p class="flex justify-between gap-3 border-t border-surface-700 pt-2 font-semibold text-amber-200"><span>Total gold</span><span>{money(mode === 'average' ? cost.expected : cost.worst)}</span></p>
			</div>
		{/if}
		<section aria-label="Breath strategy" class="space-y-2 rounded-xs border border-accent-500/30 bg-accent-500/5 p-3">
			<h3 class="flex items-center gap-1.5 text-sm font-semibold text-accent-300">{#each breathIds as id}{@const icon = materialIcon(id)}{#if icon}<img src={iconUrl(icon)} alt={materialName(id)} class="size-5 shrink-0" />{/if}{/each}Chosen Breath Strategy</h3>
			<ul class="list-disc space-y-1.5 pl-4 text-xs">
				{#each strategies as strategy}
					<li class={strategy.selected ? 'font-semibold text-accent-300' : 'text-surface-400'}>
						{strategy.label}
					</li>
				{/each}
			</ul>
			<hr class="border-surface-700" />
			<p class="text-xs text-surface-400">Chosen strategy has the best gold efficiency among these options given your prices and bound stock.</p>
		</section>
		<ul class="list-disc space-y-1 pl-4 text-xs text-surface-400">
			<li>{mode === 'average' ? 'Average quantities are weighted across possible outcomes.' : 'Pity assumes every try fails until the next try is guaranteed.'}</li>
			<li>Bound materials are used first. These estimates do not deduct materials from your saved inventory.</li>
			<li>Market gold uses your entered prices; unset prices count as 0.</li>
		</ul>
	</div>
</div>
</dialog>
