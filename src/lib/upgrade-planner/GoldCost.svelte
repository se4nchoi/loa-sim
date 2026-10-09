<!-- A Next Upgrades row's gold cost: "+ gold" or "45k · 38.2k per 1%", editable in place. -->
<script lang="ts">
	import { tick } from 'svelte';
	import { GOLD_ICON } from './icons';
	import { formatGold, gold, goldPerPct, parseGold, setGoldCost } from './gold-costs.svelte';
	import type { Upgrade } from './upgrades';

	let { u }: { u: Upgrade } = $props();

	let editing = $state(false);
	let text = $state('');
	let input = $state<HTMLInputElement>();
	const cost = $derived(gold.costs[u.key]);
	const per = $derived(goldPerPct(u, gold.costs));

	async function edit() {
		text = cost ? formatGold(cost) : '';
		editing = true;
		await tick();
		input?.select();
	}
	function commit() {
		if (!editing) return;
		editing = false;
		setGoldCost(u.key, text.trim() ? parseGold(text) : null);
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
		placeholder="e.g. 45k or 5.5m"
		aria-label={`Gold cost of ${u.title}${u.count > 1 ? ' (one)' : ''}`}
		class="mt-0.5 h-6 w-24 rounded-xs border border-surface-600 bg-surface-800 px-1.5 text-xs text-surface-100 tabular-nums focus:border-accent-500 focus:outline-none"
	/>
{:else}
	<button
		type="button"
		onclick={edit}
		class="mt-0.5 inline-flex h-6 w-fit items-center gap-1 rounded-xs border px-1.5 text-xs font-semibold tabular-nums transition {cost
			? 'border-amber-400/50 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
			: 'border-dashed border-amber-400/60 text-amber-300 hover:bg-amber-500/10'}"
		title={cost ? 'Edit the gold cost (empty to clear)' : `Gold cost${u.count > 1 ? ' of one' : ''}, e.g. 45k or 1.2m`}
	>
		<img src={GOLD_ICON} alt="" class="size-4 shrink-0" />
		{#if cost}{formatGold(cost)}{#if per}<span class="font-normal text-surface-300">· {formatGold(per)} per 1%</span>{/if}{:else}Add gold cost{/if}
	</button>
{/if}
