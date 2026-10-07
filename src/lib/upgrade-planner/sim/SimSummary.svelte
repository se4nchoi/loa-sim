<script lang="ts">
	import { formatTop, type CpStanding } from '../cp-distribution';
	import { formatCp } from '../format';
	import Delta from './Delta.svelte';
	import { btn, type SectionDelta, type SimSection } from './ui';

	let {
		current,
		simulated,
		ilvlBefore,
		ilvlAfter,
		sections,
		standings = [],
		standingKey = $bindable(null),
		className = '',
		onreset,
		onundo,
		onredo,
		canUndo,
		canRedo
	}: {
		current: number;
		simulated: number;
		ilvlBefore: number | null;
		ilvlAfter: number | null;
		sections: Record<SimSection, SectionDelta>;
		standings?: CpStanding[];
		standingKey?: string | null;
		className?: string;
		onreset: () => void;
		onundo: () => void;
		onredo: () => void;
		canUndo: boolean;
		canRedo: boolean;
	} = $props();

	const LABELS: Record<SimSection, string> = {
		gear: 'Equipment',
		accessories: 'Accessories',
		bracelet: 'Bracelet',
		gems: 'Gems',
		engravings: 'Engravings',
		arkGrid: 'Ark Grid',
		karma: 'Karma'
	};
	const standing = $derived(standings.find((s) => s.key === standingKey) ?? standings[0]);
	const delta = $derived((simulated / current - 1) * 100);
	const changed = $derived((Object.entries(sections) as [SimSection, SectionDelta][]).filter(([, d]) => Math.abs(d.pct) > 0.00005));
	const color = (v: number) => (v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-surface-300');
</script>

<div class="flex flex-col divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800">
	<div class="flex flex-row items-center bg-black/10 px-3 py-2 font-bold">
		<span>Combat Power Simulator</span>
	</div>
	<div class="flex flex-row gap-1.5 px-2 py-2">
		<button type="button" class="{btn} flex-1 disabled:opacity-40" disabled={!canUndo} onclick={onundo} title="Undo (Ctrl+Z)">↶ Undo</button>
		<button type="button" class="{btn} flex-1 disabled:opacity-40" disabled={!canRedo} onclick={onredo} title="Redo (Ctrl+Y)">↷ Redo</button>
		<button type="button" class="{btn} flex-1" onclick={onreset}>Reset</button>
	</div>
	<div class="flex flex-col gap-1 p-2">
		<span class="text-xs text-surface-400">Current</span>
		<span class="text-lg font-bold text-surface-200">{formatCp(current)}</span>
		<span class="mt-1 text-xs text-surface-400">Simulated</span>
		<div class="flex flex-row items-baseline gap-2">
			<span class="text-2xl font-bold text-red-400">{formatCp(simulated)}</span>
			<Delta pct={delta} cp={simulated - current} class="text-sm font-semibold" />
		</div>
		{#if ilvlBefore !== null && ilvlAfter !== null}
			<span class="mt-1 text-xs text-surface-400">Item Level</span>
			<span class="text-sm text-surface-200">
				{ilvlBefore.toFixed(2)}{#if ilvlAfter !== ilvlBefore} → <span class={color(ilvlAfter - ilvlBefore)}>{ilvlAfter.toFixed(2)}</span>{/if}
			</span>
		{/if}
	</div>
	{#if standing}
		{@const now = standing.top(current)}
		{@const after = standing.top(simulated)}
		<div class="flex flex-col gap-1 p-2">
			<select
				class="h-7 w-full rounded-xs border border-surface-700 bg-surface-950 px-1.5 text-xs text-surface-200 focus:border-accent-500 focus:outline-none"
				aria-label="Item level range to compare with"
				title={`${className}s on lostark.bible in this item level range`}
				bind:value={standingKey}
			>
				{#each standings as s (s.key)}
					<option value={s.key}>{s.key.endsWith('-all') ? '' : 'Item Level '}{s.label} ({s.count.toLocaleString()} {className}s)</option>
				{/each}
			</select>
			<div class="flex flex-row items-baseline gap-1.5 text-sm whitespace-nowrap tabular-nums">
				<span class="text-surface-200">{formatTop(now)}</span>
				{#if formatTop(after) !== formatTop(now)}
					<span class="text-surface-400">→</span>
					<span class="font-semibold {after < now ? 'text-green-400' : 'text-red-400'}">{formatTop(after)}</span>
				{/if}
			</div>
		</div>
	{/if}
	{#if changed.length}
		<div class="grid grid-cols-[1fr_max-content] p-2">
			{#each changed as [g, d] (g)}
				<span class="text-sm text-surface-300">{LABELS[g]}</span>
				<Delta pct={d.pct} cp={d.cp} class="text-right text-sm" />
			{/each}
		</div>
	{:else}
		<p class="p-2 text-xs text-surface-400">Change anything on the left to see its effect on Combat Power.</p>
	{/if}
</div>
