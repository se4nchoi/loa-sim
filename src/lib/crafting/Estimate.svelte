<script lang="ts">
	import type { CraftRecipe } from './data';
	import type { calculateCraft } from './calculate';
	type Result = ReturnType<typeof calculateCraft>;
	let { recipe, result, expected, successChance }: { recipe: CraftRecipe; result: Result; expected: Result | null; successChance: number } = $props();
	const fmt = (n: number | null, digits = 2) => n === null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: digits });
	const signed = (n: number | null) => n === null ? '—' : `${n > 0 ? '+' : ''}${fmt(n)}`;
	const tone = (n: number | null) => n === null ? 'text-surface-400' : n >= 0 ? 'text-green-400' : 'text-red-400';
	const perCraft = $derived(result.profit === null ? null : result.profit / result.crafts);
</script>

<section class="estimate-card" aria-labelledby="estimate-heading">
	<h2 id="estimate-heading" class="font-semibold">Crafting estimate</h2>
	{#if result.missing.length}<p class="mt-2 rounded-xs border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-xs text-amber-300">Add {result.missing.length} missing price{result.missing.length === 1 ? '' : 's'} in Materials to complete the estimate.</p>{/if}
	<div class="my-4 rounded-xs border p-4 {recipe.tradeable === false || perCraft === null ? 'border-surface-700 bg-surface-950/50' : perCraft >= 0 ? 'border-green-400/30 bg-green-400/5' : 'border-red-400/30 bg-red-400/5'}">
		<p class="text-sm font-semibold text-surface-100">{recipe.tradeable === false ? 'Cost / bound item' : 'Profit / craft'}</p>
		<p class="mt-2 text-3xl font-bold tabular-nums {recipe.tradeable === false ? 'text-surface-100' : tone(perCraft)}">{recipe.tradeable === false ? fmt(result.unitCost) : signed(perCraft)} <span class="text-sm font-normal text-surface-400">gold</span></p>
		<p class="mt-2 text-xs text-surface-300">1 craft = {fmt(recipe.output, 0)} item{recipe.output === 1 ? '' : 's'} · great success excluded</p>
	</div>
	<dl class="grid grid-cols-2 gap-3">
		{#if recipe.tradeable !== false}<div class="rounded-xs border border-surface-700 p-3"><dt class="text-xs text-surface-300">Plan profit · {fmt(result.crafts, 0)} craft{result.crafts === 1 ? '' : 's'}</dt><dd class="mt-1 text-lg font-semibold tabular-nums {tone(result.profit)}">{signed(result.profit)}</dd></div>{:else}<div class="rounded-xs border border-surface-700 p-3"><dt class="text-xs text-surface-300">Plan cost · {fmt(result.crafts, 0)} craft{result.crafts === 1 ? '' : 's'}</dt><dd class="mt-1 text-lg font-semibold tabular-nums">{fmt(result.totalCost)}</dd></div>{/if}
		<div class="rounded-xs border border-amber-400/25 bg-amber-400/5 p-3"><dt class="text-xs text-amber-200">Gold needed now</dt><dd class="mt-1 text-lg font-semibold text-amber-300 tabular-nums">{fmt(result.cashNeeded)}</dd></div>
	</dl>
	<p class="mt-3 text-xs text-surface-400">{recipe.tradeable === false ? 'Bound output cannot be sold.' : 'Profit includes selling fees.'} Owned materials count at market value.</p>
	{#if expected}
		<section class="mt-4 rounded-xs border border-violet-400/30 bg-violet-400/5 p-3" aria-label="Expected great success result">
			<h3 class="text-sm font-semibold text-violet-200">With great success · expected</h3>
			<dl class="mt-2 space-y-2 text-xs">
				<div class="result-row"><dt>Output · {fmt(successChance, 3)}% chance</dt><dd>{fmt(expected.expectedOutput, 3)} <span class="text-surface-400">vs {fmt(result.output, 0)}</span></dd></div>
				{#if recipe.tradeable !== false}<div class="result-row"><dt>Profit / craft</dt><dd class={tone(expected.profit)}>{signed(expected.profit === null ? null : expected.profit / expected.crafts)}</dd></div>{/if}
				<div class="result-row"><dt>Cost / item</dt><dd>{fmt(expected.unitCost)}</dd></div>
			</dl>
			<p class="mt-2 text-xs text-surface-400">Long-run average; individual crafts vary.</p>
		</section>
	{/if}
	<details class="mt-4 border-t border-surface-700 pt-3">
		<summary class="cursor-pointer text-sm font-medium text-surface-200">Profit & cash details</summary>
		<div class="mt-4 space-y-4">
			<section><h3 class="mb-3 text-xs font-semibold tracking-wide text-green-300 uppercase">Craft economics</h3>
				<dl class="space-y-2 text-sm">
					{#if recipe.tradeable !== false}
						<div class="result-row"><dt>Return on cost</dt><dd class={tone(result.roi)}>{fmt(result.roi)}{result.roi === null ? '' : '%'}</dd></div>
						<div class="result-row"><dt>Cost / item</dt><dd>{fmt(result.unitCost)}</dd></div>
						<div class="result-row"><dt>Break-even price / item</dt><dd class="text-amber-300">{fmt(result.breakEven, 0)}</dd></div>
					{/if}
					<div class="result-row"><dt>{recipe.tradeable === false ? 'Saving vs replacement' : 'Saving vs buying'}</dt><dd class={tone(result.selfUseSaving)}>{signed(result.selfUseSaving)}</dd></div>
				</dl><p class="mt-2 text-xs text-surface-400">Self-use savings exclude the selling fee.</p>
			</section>
			<section class="border-t border-surface-700 pt-4"><h3 class="mb-3 text-xs font-semibold tracking-wide text-amber-200 uppercase">Cash flow · full plan</h3>
				<dl class="space-y-2 text-sm">
					<div class="result-row"><dt>Crafting fee</dt><dd>{fmt(result.craftingGold)} <span class="text-xs text-surface-400">({result.goldPerCraft} each)</span></dd></div>
					<div class="result-row"><dt>Material purchases</dt><dd>{fmt(result.purchaseGold)}</dd></div>
					{#if recipe.tradeable !== false}<div class="result-row"><dt>Sale proceeds after fee</dt><dd>{fmt(result.revenue)}</dd></div><div class="result-row"><dt>Gold after sale</dt><dd class={tone(result.cashAfterSale)}>{signed(result.cashAfterSale)}</dd></div>{/if}
					<div class="result-row"><dt>Leftover material value</dt><dd>{fmt(result.leftoverValue)}</dd></div>
					{#if recipe.tradeable !== false}<div class="result-row"><dt>Gain vs selling owned stock</dt><dd class={tone(result.vsSelling)}>{signed(result.vsSelling)}</dd></div>{/if}
				</dl><p class="mt-3 text-xs text-surface-400">Purchases round up to market bundles. Leftovers retain market value.{#if recipe.tradeable !== false} Gain vs selling deducts the after-fee value of owned materials used.{/if}</p>
			</section>
		</div>
	</details>
</section>

<style>
	.estimate-card { border: 1px solid var(--color-surface-800); border-radius: 2px; background: var(--color-surface-900); padding: 1rem; }
	.result-row { display: flex; justify-content: space-between; align-items: baseline; gap: .75rem; }
	.result-row dt { color: var(--color-surface-300); }
	.result-row dd { flex-shrink: 0; text-align: right; font-variant-numeric: tabular-nums; }
</style>
