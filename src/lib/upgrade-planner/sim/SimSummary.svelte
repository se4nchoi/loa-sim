<script lang="ts">
	import { formatTop, type CpStanding, type IlvlRange } from '../cp-distribution';
	import { folded, toggleFold } from './folded.svelte';
	import FoldChip from './FoldChip.svelte';
	import Segmented from './Segmented.svelte';
	import Stepper from './Stepper.svelte';
	import { formatCp, formatPct } from '../format';
	import Delta from './Delta.svelte';
	import { btn, type SectionDelta, type SimSection } from './ui';
	import { GOLD_ICON } from '../icons';

	let {
		current,
		simulated,
		ilvlBefore,
		ilvlAfter,
		sections,
		standing = null,
		brackets = [],
		ownRange = null,
		range = $bindable(),
		className = '',
		onreset,
		onundo,
		onredo,
		canUndo,
		canRedo,
		split = null,
		onbudget
	}: {
		current: number;
		simulated: number;
		ilvlBefore: number | null;
		ilvlAfter: number | null;
		sections: Record<SimSection, SectionDelta>;
		standing?: CpStanding | null;
		/** Item level brackets with data (10-level steps). */
		brackets?: number[];
		ownRange?: IlvlRange;
		range?: IlvlRange;
		className?: string;
		onreset: () => void;
		onundo: () => void;
		onredo: () => void;
		canUndo: boolean;
		canRedo: boolean;
		/** Supports: Buff Power and Shield & Heal Power (bible's breakdown) and their % change. */
		split?: { buff: { value: number; pct: number }; shieldHeal: { value: number; pct: number } } | null;
		onbudget?: () => void;
	} = $props();

	const LABELS: Record<SimSection, string> = {
		gear: 'Equipment',
		accessories: 'Accessories',
		bracelet: 'Bracelet',
		skins: 'Skins',
		gems: 'Gems',
		engravings: 'Engravings',
		arkGrid: 'Ark Grid',
		karma: 'Karma',
		paradise: 'Paradise'
	};
	// Item level range: presets around the character's own bracket, or any from–to in 10-level steps.
	const lo = $derived(brackets[0] ?? 0);
	const hi = $derived((brackets.at(-1) ?? 0) + 10);
	type Preset = 'own' | 'pm10' | 'pm20' | 'all';
	const PRESETS: { value: Preset; label: string }[] = [
		{ value: 'own', label: 'ilvl' },
		{ value: 'pm10', label: '±10' },
		{ value: 'pm20', label: '±20' },
		{ value: 'all', label: 'All' }
	];
	const widen = (n: number): IlvlRange =>
		ownRange ? { from: Math.max(lo, ownRange.from - n), to: Math.min(hi, ownRange.to + n) } : null;
	const preset = $derived.by<Preset | null>(() => {
		if (!range) return 'all';
		for (const [p, n] of [['own', 0], ['pm10', 10], ['pm20', 20]] as const) {
			const r = widen(n);
			if (r && r.from === range.from && r.to === range.to) return p;
		}
		return null;
	});
	const applyPreset = (p: Preset) => (range = p === 'all' ? null : widen({ own: 0, pm10: 10, pm20: 20 }[p]));
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
		<button type="button" class="{btn} flex-1" onclick={onreset} aria-label="Reset simulation">Reset</button>
	</div>
	<div class="flex flex-col gap-1 p-2">
		<span class="text-xs text-surface-400">Current</span>
		<span class="text-lg font-bold text-surface-200">{formatCp(current)}</span>
		<span class="mt-1 text-xs text-surface-400">Simulated</span>
		<div class="flex flex-row items-baseline gap-2">
			<span class="text-2xl font-bold {split ? 'text-green-400' : 'text-red-400'}">{formatCp(simulated)}</span>
			<Delta pct={delta} cp={simulated - current} class="text-sm font-semibold" />
		</div>
		{#if ilvlBefore !== null && ilvlAfter !== null}
			<span class="mt-1 text-xs text-surface-400">Item Level</span>
			<span class="text-sm text-surface-200">
				{ilvlBefore.toFixed(2)}{#if ilvlAfter !== ilvlBefore} → <span class={color(ilvlAfter - ilvlBefore)}>{ilvlAfter.toFixed(2)}</span>{/if}
			</span>
		{/if}
		{#if onbudget}<button type="button" onclick={onbudget} class="mt-2 hidden h-8 w-full items-center justify-center gap-1.5 rounded-xs border border-amber-300/70 bg-amber-500/5 px-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/15 lg:inline-flex" aria-haspopup="dialog"><img src={GOLD_ICON} alt="" class="size-4" />Budget for current changes</button>{/if}
		{#if split}
			<div
				class="mt-1 grid grid-cols-[1fr_max-content_max-content] items-baseline gap-x-2 text-sm"
				title="A support's Combat Power is Buff Power plus Shield & Heal Power (lostark.bible's breakdown)"
			>
				{#each [['Buff Power', 'text-sky-300', split.buff], ['Shield & Heal', 'text-red-300', split.shieldHeal]] as const as [name, tone, v] (name)}
					<span class="text-xs {tone}">{name}</span>
					<span class="text-right text-surface-200 tabular-nums">≈{formatCp(v.value)}</span>
					<span class="w-16 text-right text-xs tabular-nums {color(v.pct)}">{formatPct(v.pct)}%</span>
				{/each}
			</div>
		{/if}
	</div>
	{#if brackets.length && range !== undefined}
		<div class="flex flex-col gap-1.5 p-2">
			<button
				type="button"
				class="group flex flex-row items-center justify-between gap-2 text-left"
				aria-expanded={!folded.standing}
				onclick={() => toggleFold('standing')}
				title={folded.standing ? 'Show standing details' : 'Fold standing'}
			>
				<span class="text-xs text-surface-400 group-hover:text-surface-100" title={`Combat Power among ${className}s on lostark.bible`}>
					Standing
				</span>
				{#if folded.standing && standing}
					{@const now = standing.top(current)}
					{@const after = standing.top(simulated)}
					<span class="ml-auto text-sm font-bold whitespace-nowrap text-surface-100 tabular-nums">
						{formatTop(now)}{#if formatTop(after) !== formatTop(now)}<span class="font-normal text-surface-400"> → </span><span class={after < now ? 'text-green-400' : 'text-red-400'}>{formatTop(after)}</span>{/if}
					</span>
				{:else}
					<span class="ml-auto truncate text-xs text-surface-500">
						{range ? `Item Level ${range.from}–${range.to}` : 'All item levels'} · {standing ? `${standing.count.toLocaleString()} ${className}s` : 'no data'}
					</span>
				{/if}
				<FoldChip open={!folded.standing} />
			</button>
			{#if folded.standing}
				<!-- folded: the one line above -->
			{:else if standing}
				{@const now = standing.top(current)}
				{@const after = standing.top(simulated)}
				<div class="flex flex-row items-baseline gap-1.5 text-lg whitespace-nowrap tabular-nums">
					<span class="font-bold text-surface-100">{formatTop(now)}</span>
					{#if formatTop(after) !== formatTop(now)}
						<span class="text-sm text-surface-400">→</span>
						<span class="font-bold {after < now ? 'text-green-400' : 'text-red-400'}">{formatTop(after)}</span>
					{/if}
				</div>
			{/if}
			{#if !folded.standing}
				<Segmented value={preset} options={PRESETS} onselect={applyPreset} label="Item level range" size="h-7 flex-1 px-2 text-xs" />
			{/if}
			{#if range && !folded.standing}
				<div class="flex flex-row items-center gap-1.5">
					<Stepper bind:value={range.from} min={lo} max={range.to - 10} step={10} label="Item level from" width="w-11" />
					<span class="text-surface-400">–</span>
					<Stepper bind:value={range.to} min={range.from + 10} max={hi} step={10} label="Item level to" width="w-11" />
				</div>
			{/if}
		</div>
	{/if}
	{#if changed.length}
		<div class="grid grid-cols-[1fr_max-content] p-2">
			{#each changed as [g, d] (g)}
				<span class="text-sm text-surface-300">{LABELS[g]}</span>
				<Delta pct={d.pct} cp={d.cp} class="text-right text-sm" />
			{/each}
		</div>
	{/if}
</div>
