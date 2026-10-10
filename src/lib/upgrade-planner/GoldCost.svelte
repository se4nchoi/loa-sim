<!-- A Next Upgrades row's gold cost: calculated honing estimates or editable prices for other upgrades. -->
<script lang="ts">
	import { tick } from 'svelte';
	import { goldPriceButton } from './sim/ui';
	import { GOLD_ICON } from './icons';
	import { bookCost, costsForCharacter, formatGold, gold, manualGoldCost, parseGold, setBookPrice, setGoldCost } from './gold-costs.svelte';
	import { breathStrategy, type HoningCost } from './honing-cost';
	import type { Upgrade } from './upgrades';
	import HoningBreakdown from './HoningBreakdown.svelte';
	const detailsButton = 'inline-flex h-6 w-6 items-center justify-center rounded-xs border border-surface-700 bg-surface-800 text-xs font-semibold text-surface-100 transition hover:border-surface-500 hover:bg-surface-700 active:bg-surface-600';

	let {
		u,
		auto,
		showPer = true,
		characterKey = '',
		onedit
	}: {
		u: Upgrade;
		characterKey?: string;
		/** Cost calculated from material prices. Equipment honing cannot be overridden by a typed total. */
		auto?: HoningCost;
		/** Show gold per 1% next to the cost (the sidebar shows it by the gain). */
		showPer?: boolean;
		/** Open the shared price editor elsewhere, rather than editing inline. */
		onedit?: () => void;
	} = $props();

	let editing = $state(false);
	let breakdownMode = $state<'average' | 'pity' | null>(null);
	let text = $state('');
	let input = $state<HTMLInputElement>();
	// Engraving book rows are always price per book × books; a total typed there before book prices existed is ignored.
	const canEdit = $derived(u.category !== 'honing' && u.category !== 'quality');
	const typed = $derived(u.books ? undefined : manualGoldCost(u, costsForCharacter(characterKey)));
	/** Engraving book rows are priced per book; the box edits that price. */
	const bookPrice = $derived(u.books ? gold.bookPrices[u.books.engraving] : undefined);
	const cost = $derived(typed ?? auto?.expected ?? bookCost(u, gold.bookPrices) ?? u.knownCost);
	const per = $derived(cost !== undefined && u.gainPct > 0 ? cost / u.gainPct : null);
	const autoTitle = $derived(
		u.quality ? `Average ${formatGold(u.knownCost!)} gold over ${u.quality.taps.toFixed(1)} taps, ${u.quality.fee} gold per tap. Assumes unlimited Chaos Stones. Stops at target quality or higher; CP gain shown is at the target. No pity.` : auto
			? `Average ${formatGold(auto.expected)} over ${auto.taps.toFixed(1)} taps (used for gold per 1%). ${breathStrategy(auto)} ` +
					`Pity ${formatGold(auto.worst)} at ${auto.maxTaps} taps, when the meter forces success. ${u.category === 'karma' ? 'Assumes unlimited Destiny Stones. ' : ''}${canEdit ? 'Click to type your own cost instead.' : 'Calculated from your material prices and bound stock.'}`
			: ''
	);

	async function edit() {
		if (!canEdit) return;
		if (onedit) return onedit();
		text = u.books ? (bookPrice !== undefined ? formatGold(bookPrice) : '') : typed ? formatGold(typed) : '';
		editing = true;
		await tick();
		input?.select();
	}
	function commit() {
		if (!editing) return;
		editing = false;
		if (u.books) {
			setBookPrice(u.books.engraving, text.trim() ? parseGold(text) : null);
			if (gold.costs[u.key] !== undefined) setGoldCost(u.key, null); // drop an old typed total for this row
		}
		else setGoldCost(u.key, text.trim() ? parseGold(text) : null, characterKey);
	}
</script>

{#if editing}
	<input
		bind:this={input}
		bind:value={text}
		onblur={commit}
		onkeydown={(e) => {
			if (e.key === 'Enter') commit();
			if (e.key === 'Escape') editing = false;
		}}
		placeholder={u.books ? 'per book, e.g. 80k' : 'e.g. 45k or 5.5m'}
		aria-label={u.books ? `Price of one ${u.books.name} relic book` : `Gold cost of ${u.title}${u.count > 1 ? ' (one)' : ''}`}
		class="mt-0.5 h-6 w-24 rounded-xs border border-surface-600 bg-surface-800 px-1.5 text-xs text-surface-100 tabular-nums focus:border-accent-500 focus:outline-none"
	/>
{:else}
	<!-- Average and pity boxes share one grid column, so they are the same width. -->
	<div class="mt-0.5 inline-grid w-fit grid-cols-[auto_auto] gap-0.5">
		<button
			type="button"
			disabled={!canEdit}
			onclick={edit}
			class="col-start-1 {goldPriceButton(cost)}"
			title={u.books
				? `Price of one ${u.books.name} relic book; this row reads ${u.books.count}${bookPrice !== undefined ? ` (${formatGold(bookPrice)} × ${u.books.count})` : ''}`
				: typed
					? 'Edit the gold cost (empty to clear)'
						: auto || u.quality
						? autoTitle
						: !canEdit ? (cost === 0 ? 'Free' : 'No calculated cost is available for this upgrade yet.') : `Gold cost${u.count > 1 ? ' of one' : ''}, e.g. 45k or 1.2m`}
		>
			<img src={GOLD_ICON} alt="" class="size-4 shrink-0" />
			{#if cost === 0 && !typed}Free{:else if cost !== undefined}{#if !typed && (auto || u.quality)}<span class="ml-auto">≈{formatGold(cost)}</span><span class="w-6 text-left font-normal text-surface-400">avg</span>{:else}{formatGold(cost)}{/if}{#if per !== null && showPer}<span class="font-normal whitespace-nowrap text-surface-300 max-sm:hidden">· {formatGold(per)} per 1%</span>{/if}{:else}{!canEdit ? 'Cost unavailable' : u.books ? 'Add book price' : 'Add gold cost'}{/if}
		</button>
		{#if auto?.breakdown}
			<button type="button" class="{detailsButton} col-start-2 row-start-1" onclick={() => (breakdownMode = 'average')} aria-label={`Average material breakdown for ${u.title}`} title="Average bound materials used and market purchases">?</button>
		{/if}
		{#if u.books && bookPrice !== undefined && !typed}
			<span class="col-start-1 text-[11px] text-surface-400 tabular-nums">{formatGold(bookPrice)} / book × {u.books.count}</span>
		{/if}
		{#if auto && !typed}
			<!-- Pity: every tap fails until the meter forces success. -->
			<span
				class="col-start-1 flex h-6 items-center gap-1 rounded-xs border border-orange-400/50 bg-orange-500/10 px-1.5 text-xs font-semibold whitespace-nowrap text-orange-300 tabular-nums"
				title={`Pity: ${auto.maxTaps} taps, when ${u.category === 'karma' ? 'the Karma pity meter' : "artisan's energy"} forces success${u.category === 'karma' ? '. Assumes unlimited Destiny Stones.' : ''}`}
			>
				<img src={GOLD_ICON} alt="" class="size-4 shrink-0" /><span class="ml-auto">{formatGold(auto.worst)}</span><span class="w-6 text-left font-normal text-orange-300/70">pity</span>
				{#if showPer && u.gainPct > 0}<span class="font-normal whitespace-nowrap text-orange-200/80 max-sm:hidden">· {formatGold(auto.worst / u.gainPct)} per 1%</span>{/if}
			</span>
			{#if auto.breakdown}
				<button type="button" class="{detailsButton} col-start-2 row-start-2" onclick={() => (breakdownMode = 'pity')} aria-label={`Pity material breakdown for ${u.title}`} title="Bound materials used and market purchases at pity">?</button>
			{/if}
		{/if}
	</div>
{/if}

{#if breakdownMode && auto?.breakdown}
	<HoningBreakdown cost={auto} title={u.title} initialMode={breakdownMode} onclose={() => (breakdownMode = null)} />
{/if}
