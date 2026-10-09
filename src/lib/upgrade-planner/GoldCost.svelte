<!-- A Next Upgrades row's gold cost: "+ gold" or "45k · 38.2k per 1%", editable in place. -->
<script lang="ts">
	import { tick } from 'svelte';
	import { GOLD_ICON } from './icons';
	import { bookCost, formatGold, gold, parseGold, setBookPrice, setGoldCost } from './gold-costs.svelte';
	import type { HoningCost } from './honing-cost';
	import type { Upgrade } from './upgrades';

	let {
		u,
		auto,
		showPer = true
	}: {
		u: Upgrade;
		/** Cost calculated from material prices (honing); a typed cost overrides it. */
		auto?: HoningCost;
		/** Show gold per 1% next to the cost (the sidebar shows it by the gain). */
		showPer?: boolean;
	} = $props();

	let editing = $state(false);
	let text = $state('');
	let input = $state<HTMLInputElement>();
	// Engraving book rows are always price per book × books; a total typed there before book prices existed is ignored.
	const typed = $derived(u.books ? undefined : gold.costs[u.key]);
	/** Engraving book rows are priced per book; the box edits that price. */
	const bookPrice = $derived(u.books ? gold.bookPrices[u.books.engraving] : undefined);
	const cost = $derived(typed ?? auto?.expected ?? bookCost(u, gold.bookPrices) ?? u.knownCost);
	const per = $derived(cost !== undefined && u.gainPct > 0 ? cost / u.gainPct : null);
	const autoTitle = $derived(
		auto
			? `Average ${formatGold(auto.expected)} over ${auto.taps.toFixed(1)} taps${auto.breath ? ` with full ${auto.breathLabel}` : ''} (used for gold per 1%). ` +
					`Pity ${formatGold(auto.worst)} at ${auto.maxTaps} taps, when the meter forces success. ${u.category === 'karma' ? 'Assumes unlimited Destiny Stones. ' : ''}Click to type your own cost instead.`
			: ''
	);

	async function edit() {
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
		else setGoldCost(u.key, text.trim() ? parseGold(text) : null);
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
	<div class="mt-0.5 inline-grid w-fit gap-0.5">
		<button
			type="button"
			onclick={edit}
			class="inline-flex h-6 items-center gap-1 rounded-xs border px-1.5 text-xs font-semibold tabular-nums transition {cost !== undefined
				? 'border-amber-400/50 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
				: 'border-dashed border-amber-400/60 text-amber-300 hover:bg-amber-500/10'}"
			title={u.books
				? `Price of one ${u.books.name} relic book; this row reads ${u.books.count}${bookPrice !== undefined ? ` (${formatGold(bookPrice)} × ${u.books.count})` : ''}`
				: typed
					? 'Edit the gold cost (empty to clear)'
					: auto
						? autoTitle
						: `Gold cost${u.count > 1 ? ' of one' : ''}, e.g. 45k or 1.2m`}
		>
			<img src={GOLD_ICON} alt="" class="size-4 shrink-0" />
			{#if cost === 0 && !typed}Free{#if showPer}<span class="font-normal text-surface-300">· {u.detail}</span>{/if}{:else if cost !== undefined}{#if !typed && auto}<span class="ml-auto">≈{formatGold(cost)}</span><span class="w-6 text-left font-normal text-surface-400">avg</span>{:else}{formatGold(cost)}{/if}{#if per !== null && showPer}<span class="font-normal text-surface-300">· {formatGold(per)} per 1% {!typed && auto ? 'avg' : ''}</span>{/if}{:else}{u.books ? 'Add book price' : 'Add gold cost'}{/if}
		</button>
		{#if u.books && bookPrice !== undefined && !typed}
			<span class="text-[11px] text-surface-400 tabular-nums">{formatGold(bookPrice)} / book × {u.books.count}</span>
		{/if}
		{#if auto && !typed}
			<!-- Pity: every tap fails until the meter forces success. -->
			<span
				class="flex h-6 items-center gap-1 rounded-xs border border-orange-400/50 bg-orange-500/10 px-1.5 text-xs font-semibold text-orange-300 tabular-nums"
				title={`Pity: ${auto.maxTaps} taps, when ${u.category === 'karma' ? 'the Karma pity meter' : "artisan's energy"} forces success${u.category === 'karma' ? '. Assumes unlimited Destiny Stones.' : ''}`}
			>
				<img src={GOLD_ICON} alt="" class="size-4 shrink-0" /><span class="ml-auto">{formatGold(auto.worst)}</span><span class="w-6 text-left font-normal text-orange-300/70">pity</span>
				{#if showPer && u.gainPct > 0}<span class="font-normal text-orange-200/80">· {formatGold(auto.worst / u.gainPct)} per 1% pity</span>{/if}
			</span>
		{/if}
	</div>
{/if}
