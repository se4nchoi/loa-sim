<!--
	Honing material prices (NA has no market API): typed once, kept in this browser, used to price every honing
	row in Next Upgrades. Entered the way the market lists them (stones per 100, shards per 1,000); 0 = bound.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { formatGold, gold, parseOwned, parsePrice, setMaterialBound, setMaterialPrice } from './gold-costs.svelte';
	import { PLENTY, SHARDS, materialIcon, materialName } from './honing-cost';
	import { iconUrl } from './icons';

	let {
		ids,
		characterKey,
		characterName,
		onclose
	}: {
		/** Material ids to ask for (plus 'shards'). */
		ids: string[];
		/** Bound mats are kept per character; market prices are shared. */
		characterKey: string;
		characterName?: string;
		onclose: () => void;
	} = $props();
	const bound = $derived(gold.bound[characterKey] ?? {});

	let dialog: HTMLDialogElement;
	onMount(() => {
		dialog.showModal();
		dialog.focus(); // the dialog itself, not a control: no keyboard popping up, no focus ring on Close
	});

	/** Units the market sells in: destruction / guardian stones by 100, shards by 1,000. */
	const unit = (id: string) => (id === SHARDS ? 1000 : id.startsWith('66102') ? 100 : 1);
	const unitLabel = (id: string) => (unit(id) === 1 ? 'each' : `per ${unit(id).toLocaleString()}`);
	const shown = (id: string) => formatGold((gold.prices[id] ?? 0) * unit(id));

	const shownOwned = (id: string) => (!bound[id] ? '0' : bound[id] >= PLENTY ? '∞' : bound[id].toLocaleString());
	function commitOwned(id: string, text: string) {
		const v = parseOwned(text);
		if (v !== null) setMaterialBound(characterKey, id, v);
	}

	function commit(id: string, text: string) {
		if (!text.trim()) return setMaterialPrice(id, 0);
		const v = parsePrice(text);
		if (v !== null) setMaterialPrice(id, v / unit(id));
	}
	const changed = $derived(
		gold.pricesAt
			? new Date(gold.pricesAt).toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
			: '—'
	);
</script>

<!-- Focusable itself (tabindex -1) so opening focuses the dialog, not its first input or Close. -->
<dialog
	bind:this={dialog}
	tabindex="-1"
	{onclose}
	onclick={(e) => e.target === dialog && dialog.close()}
	aria-labelledby="material-prices-title"
	class="fixed top-[80px] m-0 max-h-none outline-none max-w-none bg-transparent p-0 text-inherit backdrop:bg-black/60 max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:w-full sm:left-1/2 sm:-translate-x-1/2"
>
	<div class="flex w-[600px] flex-col divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800 max-sm:w-full max-sm:rounded-t-xl max-sm:rounded-b-none max-sm:animate-[sheet-up_320ms_cubic-bezier(0.22,1,0.36,1)]">
		<div class="flex flex-row items-center justify-between px-4 py-2.5 font-bold">
			<span id="material-prices-title">Honing material prices</span>
			<button type="button" class="text-surface-300 hover:text-surface-50" aria-label="Close" onclick={() => dialog.close()}>
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
			</button>
		</div>
		<div class="flex max-h-[70vh] flex-col gap-3 overflow-y-auto px-4 py-3 text-sm">
			<ul class="list-disc pl-5 text-xs text-surface-100">
				<li>Character-bound mats are used first, then the market buy is simulated</li>
				<li>Put a big number (9999999999) to force 0 gold for the mat</li>
				<li>Calculates the average-tap and pity-tap cost of each honing step</li>
				<li>Character-bound mats are saved per character; market prices are shared</li>
				<li class="text-amber-300/80">Each upgrade is priced on its own: every one assumes all of this character's bound mats are available to it (3k leapstones count in full for an armor tap or a weapon tap)</li>
			</ul>
			<!-- Phones: icon only (the name is its tooltip / label), so the two inputs keep their room. -->
			<div class="grid grid-cols-[2rem_minmax(0,1fr)_8rem_6rem_3.5rem] items-center gap-x-2 gap-y-1.5 max-sm:grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_3.25rem]">
				<span></span>
				<span class="max-sm:hidden"></span>
				<span class="text-right text-[11px] font-semibold tracking-wide text-surface-100 uppercase">Character-bound</span>
				<span class="text-right text-[11px] font-semibold tracking-wide text-surface-100 uppercase">Market</span>
				<span></span>
				{#each ids as id (id)}
					<div class="contents">
						{#if materialIcon(id)}
							<img src={iconUrl(materialIcon(id))} alt={materialName(id)} title={materialName(id)} class="size-8 shrink-0 rounded-xs bg-black/30" />
						{:else}
							<span class="size-8 shrink-0 rounded-xs bg-black/30"></span>
						{/if}
						<span class="min-w-0 leading-tight text-surface-100 max-sm:hidden">{materialName(id)}</span>
						<input
							value={shownOwned(id)}
							onchange={(e) => commitOwned(id, e.currentTarget.value)}
							aria-label={`${materialName(id)} bound`}
							inputmode="numeric"
							class="h-8 w-full rounded-xs border border-surface-600 bg-surface-800 px-2 text-right tabular-nums hover:border-surface-400 focus:border-accent-500 focus:outline-none {bound[id]
								? 'text-surface-50'
								: 'text-surface-400'}"
						/>
						<input
							value={shown(id)}
							aria-label={`${materialName(id)} market price (${unitLabel(id)})`}
							onchange={(e) => commit(id, e.currentTarget.value)}
							inputmode="decimal"
							class="h-8 w-full rounded-xs border border-surface-600 bg-surface-800 px-2 text-right tabular-nums hover:border-surface-400 focus:border-accent-500 focus:outline-none {gold.prices[id]
								? 'text-surface-50'
								: 'text-surface-400'}"
						/>
						<span class="text-xs text-surface-400">{unitLabel(id)}</span>
					</div>
				{/each}
			</div>
			<p class="text-xs text-surface-500">Last changed: {changed}</p>
		</div>
	</div>
</dialog>
