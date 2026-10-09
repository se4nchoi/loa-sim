<!--
	Honing material prices (NA has no market API): typed once, kept in this browser, used to price every honing
	row in Next Upgrades. Prices are entered the way the market lists them (stones per 100, shards per 1,000).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { formatGold, gold, parsePrice, setMaterialPrice } from './gold-costs.svelte';
	import { SHARDS, materialIcon, materialName } from './honing-cost';
	import { iconUrl } from './icons';

	let { ids, onclose }: { /** Material ids to ask for (plus 'shards'). */ ids: string[]; onclose: () => void } = $props();

	let dialog: HTMLDialogElement;
	onMount(() => dialog.showModal());

	/** Units the market sells in: destruction / guardian stones by 100, shards by 1,000. */
	const unit = (id: string) => (id === SHARDS ? 1000 : id.startsWith('66102') ? 100 : 1);
	const unitLabel = (id: string) => (unit(id) === 1 ? 'each' : `per ${unit(id).toLocaleString()}`);
	const shown = (id: string) => (gold.prices[id] === undefined ? '' : formatGold(gold.prices[id] * unit(id)));

	function commit(id: string, text: string) {
		if (!text.trim()) return setMaterialPrice(id, null);
		const v = parsePrice(text);
		if (v !== null) setMaterialPrice(id, v / unit(id));
	}
	const missing = $derived(ids.filter((id) => gold.prices[id] === undefined).length);
	const ago = $derived(gold.pricesAt ? Math.round((Date.now() - gold.pricesAt) / 86400000) : null);
</script>

<dialog
	bind:this={dialog}
	{onclose}
	onclick={(e) => e.target === dialog && dialog.close()}
	aria-labelledby="material-prices-title"
	class="fixed top-[80px] m-0 max-h-none max-w-none bg-transparent p-0 text-inherit backdrop:bg-black/60 sm:left-1/2 sm:-translate-x-1/2"
>
	<div class="flex w-[440px] flex-col divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800 max-sm:w-[100vw]">
		<div class="flex flex-row items-center justify-between px-4 py-2.5 font-bold">
			<span id="material-prices-title">Honing material prices</span>
			<button type="button" class="text-surface-300 hover:text-surface-50" aria-label="Close" onclick={() => dialog.close()}>
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
			</button>
		</div>
		<div class="flex max-h-[70vh] flex-col gap-3 overflow-y-auto px-4 py-3 text-sm">
			<p class="text-xs text-surface-400">
				Market prices in gold, as listed. Enter <b class="text-surface-200">0</b> for materials you already have plenty of. Honing rows in Next
				Upgrades then show their average cost (and the worst case, when the meter forces success).
			</p>
			<div class="flex flex-col divide-y divide-neutral-950">
				{#each ids as id (id)}
					<label class="flex flex-row items-center gap-3 py-1.5">
						{#if materialIcon(id)}
							<img src={iconUrl(materialIcon(id))} alt="" class="size-8 shrink-0 rounded-xs bg-black/30" />
						{:else}
							<span class="size-8 shrink-0 rounded-xs bg-black/30"></span>
						{/if}
						<span class="min-w-0 flex-1 truncate text-surface-100">{materialName(id)}</span>
						<input
							value={shown(id)}
							onchange={(e) => commit(id, e.currentTarget.value)}
							placeholder="price"
							inputmode="decimal"
							class="h-8 w-24 rounded-xs border px-2 text-right tabular-nums focus:border-accent-500 focus:outline-none {gold.prices[id] === undefined
								? 'border-amber-400/60 border-dashed bg-surface-800'
								: 'border-surface-600 bg-surface-800 hover:border-surface-400'}"
						/>
						<span class="w-20 shrink-0 text-xs text-surface-400">{unitLabel(id)}</span>
					</label>
				{/each}
			</div>
			<p class="text-xs text-surface-500">
				{missing ? `${missing} price${missing > 1 ? 's' : ''} to go.` : 'All set.'}
				{#if ago !== null}Last changed {ago === 0 ? 'today' : `${ago} day${ago > 1 ? 's' : ''} ago`}; NA prices move, so check now and then.{/if}
			</p>
		</div>
	</div>
</dialog>
