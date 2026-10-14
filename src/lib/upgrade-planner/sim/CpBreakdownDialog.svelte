<!-- How the simulated Combat Power is made up: base attack times every section's multiplier, with each section's
     share of the score, and how the current edits moved it. Opened from
     the CP card. Sections sit in three groups (Character, Gear, Systems), each with its own color: a stacked bar on
     top shows how the score splits between them, and every row has a bar for its own share. -->
<script lang="ts">
	import DrawerHandle from './DrawerHandle.svelte';
	import { onMount } from 'svelte';
	import { sheetDialog, sheetDrag } from './sheet-drag';
	import { formatCp, formatPct } from '../format';
	import { CATEGORIES, type BreakdownCategory, type BreakdownSide, type CpBreakdown } from '../cp-breakdown';
	import { btn } from './ui';

	let {
		breakdown,
		current,
		mainStat,
		mainStatName = 'Main stat',
		weaponPower,
		attackPct,
		support = false,
		onclose
	}: {
		breakdown: CpBreakdown;
		current: number;
		mainStat: number;
		mainStatName?: string;
		weaponPower: number;
		attackPct: number;
		support?: boolean;
		onclose: () => void;
	} = $props();

	let dialog: HTMLDialogElement;
	let card = $state<HTMLDivElement>();
	onMount(() => {
		dialog.showModal();
		dialog.focus();
	});

	// Categorical hues validated for the dark card surface (dataviz reference palette, slots 1–3); base is neutral.
	const HUE: Record<BreakdownCategory, string> = { character: '#3987e5', gear: '#d95926', systems: '#199e70' };
	const BASE_HUE = '#737373';
	/** A faint rule on the left of each number column, so the columns read down through every block. */
	const line = 'border-l border-white/[0.07] self-stretch flex items-center justify-end';

	const total = $derived(breakdown.total);
	const changed = $derived(
		Math.abs(breakdown.total - current) > 0.005 ||
			breakdown.sides.some((s) => Math.abs(s.base.change) > 0.00005 || s.rows.some((r) => Math.abs(r.change) > 0.00005))
	);
	const color = (v: number) => (v > 0.00005 ? 'text-green-400' : v < -0.00005 ? 'text-red-400' : 'text-surface-500');
	const share = (cp: number) => (total ? (cp / total) * 100 : 0);
	let open = $state<Record<string, boolean>>({});

	/** A side's rows by group, with each group's total share; empty groups are left out. */
	const grouped = (side: BreakdownSide) =>
		CATEGORIES.map((c) => {
			const rows = side.rows.filter((r) => (c.groups as readonly string[]).includes(r.group));
			// The group's change: its sections' changes multiply together.
			const product = (pick: (r: (typeof rows)[number]) => number) => (rows.reduce((m, r) => m * (1 + pick(r) / 100), 1) - 1) * 100;
			return { ...c, rows, cp: rows.reduce((s, r) => s + r.cp, 0), change: product((r) => r.change) };
		}).filter((c) => c.rows.length);
	const maxRow = (side: BreakdownSide) => Math.max(1e-9, ...side.rows.map((r) => r.cp));
	/**
	 * What +1% of each base attack input is worth: base attack = 2.88 × √(main stat × Weapon Power ÷ 6) × (1 + Atk.%),
	 * so +1% main stat or Weapon Power multiplies it by √1.01, and one more point of Atk.% by 1 + 1 / (100 + Atk.%).
	 */
	const baseInputs = (side: BreakdownSide) => [
		{ label: mainStatName, next: side.total * (Math.sqrt(1.01) - 1) },
		{ label: 'Weapon Power', next: side.total * (Math.sqrt(1.01) - 1) },
		{ label: 'Atk.', next: side.total / (100 + attackPct) }
	];
	// Fixed column widths so every group's block lines up. Phones keep Section · Bonus · CP · %; the bar and Change
	// join from sm up.
	const cols = $derived(
		changed
			? 'grid-cols-[minmax(0,1fr)_4.5rem_4rem_3rem] sm:grid-cols-[minmax(0,1fr)_5rem_4.5rem_4rem_3rem_4rem]'
			: 'grid-cols-[minmax(0,1fr)_4.5rem_4rem_3rem] sm:grid-cols-[minmax(0,1fr)_5rem_4.5rem_4rem_3rem]'
	);
</script>

{#snippet changeCell(v: number)}
	{#if changed}<span class="{line} text-xs max-sm:hidden {color(v)}">{Math.abs(v) > 0.00005 ? `${formatPct(v)}%` : '—'}</span>{/if}
{/snippet}

<dialog
	bind:this={dialog} use:sheetDialog={() => card}
	tabindex="-1"
	{onclose}
	onclick={(e) => {
		e.stopPropagation();
		if (e.target === dialog) dialog.close();
	}}
	aria-label="Combat Power Breakdown"
	class="fixed top-[60px] m-0 max-h-none max-w-none bg-transparent p-0 text-surface-100 outline-none backdrop:bg-black/60 max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:w-full sm:left-1/2 sm:-translate-x-1/2"
>
	<div
		bind:this={card}
		class="flex max-h-[85dvh] w-[680px] max-w-[calc(100vw-1.5rem)] flex-col rounded-xs bg-surface-900 shadow-sm shadow-neutral-800 max-sm:w-full max-sm:max-w-none max-sm:animate-[sheet-up_320ms_cubic-bezier(0.22,1,0.36,1)] max-sm:rounded-t-xl max-sm:rounded-b-none"
	>
		<DrawerHandle sheet={() => card} close={() => dialog.close()} label="CP breakdown" />
		<div
			class="flex shrink-0 flex-wrap items-start gap-3 border-b border-neutral-950 px-4 py-3"
			use:sheetDrag={{ sheet: () => card, close: () => dialog.close(), enabled: () => matchMedia('(max-width: 639px)').matches }}
		>

			<div class="min-w-0 flex-1">
				<h2 class="font-semibold">Combat Power Breakdown</h2>
				<p class="mt-1 flex flex-wrap items-baseline gap-2 tabular-nums">
					{#if changed}<span class="text-lg font-bold text-surface-300">{formatCp(current)}</span><span class="text-surface-400">→</span>{/if}
					<span class="text-2xl font-bold {support ? 'text-green-400' : 'text-red-400'}">{formatCp(total)}</span>
				</p>
			</div>
			<button type="button" class={btn} onclick={() => dialog.close()} aria-label="Close breakdown">Close</button>
		</div>
		<div class="min-h-0 space-y-4 overflow-y-auto p-4 text-sm">
			<p class="text-xs text-surface-400">
				Combat Power is base attack multiplied by every section's bonus{support ? ', once for Buff Power and once for Shield & Heal Power; the score is their sum' : ''}.
				<b class="text-surface-200">CP</b> is each section's share of your score (they add up to the total).
			</p>

			{#each breakdown.sides as side (side.label)}
				{@const groups = grouped(side)}
				{@const top = maxRow(side)}
				{@const segments = [{ key: 'base', label: side.base.label, cp: side.base.cp, hue: BASE_HUE }, ...groups.map((g) => ({ key: g.key, label: g.label, cp: g.cp, hue: HUE[g.key] }))]}
				<section aria-label={side.label} class="space-y-3 tabular-nums">
					{#if breakdown.sides.length > 1}
						<h3 class="flex items-baseline justify-between border-b border-neutral-800 pb-1 font-semibold {side.label === 'Buff Power' ? 'text-sky-300' : 'text-red-300'}">
							{side.label}<span class="text-surface-200">≈{formatCp(side.total)}</span>
						</h3>
					{/if}

					<!-- Where the score comes from: base and each group, as one stacked bar with a legend. -->
					<div class="space-y-1.5">
						<div class="flex h-3 w-full gap-0.5" role="img" aria-label={`${side.label} by group`}>
							{#each segments as seg (seg.key)}
								{#if seg.cp > 0}
									<span
										class="h-full rounded-xs first:rounded-l-sm last:rounded-r-sm"
										style:width={`${(seg.cp / side.total) * 100}%`}
										style:background-color={seg.hue}
										title={`${seg.label}: ${formatCp(seg.cp)} CP (${share(seg.cp).toFixed(1)}%)`}
									></span>
								{/if}
							{/each}
						</div>
						<div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-300">
							{#each segments as seg (seg.key)}
								<span class="flex items-center gap-1.5">
									<span class="size-2 rounded-xs" style:background-color={seg.hue}></span>{seg.label}
									<span class="text-surface-100">{formatCp(seg.cp)}</span><span class="text-surface-500">{share(seg.cp).toFixed(1)}%</span>
								</span>
							{/each}
						</div>
					</div>

					<!-- Column headings, then the base, then one block per group. -->
					<div class="grid {cols} items-center gap-x-3 px-2 text-xs font-semibold text-surface-200">
						<span>Section</span>
						<span class="max-sm:hidden"></span>
						<span class={line}>Bonus</span>
						<span class={line}>CP</span>
						<span class={line}>%</span>
						{#if changed}<span class="{line} max-sm:hidden">Change</span>{/if}
					</div>

					<div class="rounded-xs border-l-2 bg-black/20 px-2 py-1.5" style:border-color={BASE_HUE}>
						<div class="grid {cols} items-center gap-x-3">
							<button
								type="button"
								class="flex min-w-0 items-baseline gap-1 text-left font-semibold text-surface-100 hover:text-surface-50"
								aria-expanded={!!open[`${side.label}:base`]}
								onclick={() => (open[`${side.label}:base`] = !open[`${side.label}:base`])}
							>
								<span class="inline-block w-3 shrink-0 text-xs font-normal text-surface-500">{open[`${side.label}:base`] ? '▾' : '▸'}</span><span class="truncate">{side.base.label}</span>
							</button>
							<span class="max-sm:hidden"></span>
							<span class="{line} text-surface-500">—</span>
							<span class="{line} font-semibold text-surface-100">{formatCp(side.base.cp)}</span>
							<span class="{line} text-xs text-surface-400">{share(side.base.cp).toFixed(1)}%</span>
							{@render changeCell(side.base.change)}
						</div>
						{#if side.label !== 'Shield & Heal Power' && open[`${side.label}:base`]}
							<!-- The formula with this character's numbers, then what +1% of each input would add. -->
							<p class="mt-1 pl-4 text-xs text-surface-300">
								2.88 × √({mainStatName} <b class="text-surface-100">{Math.round(mainStat).toLocaleString()}</b> × Weapon Power
								<b class="text-surface-100">{Math.round(weaponPower).toLocaleString()}</b> ÷ 6) × (1 + Atk. <b class="text-surface-100">{attackPct.toFixed(1)}%</b>)
							</p>
							<p class="mt-0.5 flex flex-wrap gap-x-3 pl-4 text-xs text-surface-400">
								{#each baseInputs(side) as input (input.label)}
									<span>+1% {input.label} → <span class="text-surface-200">+{formatCp(input.next)}</span></span>
								{/each}
							</p>
						{/if}
					</div>

					{#each groups as g (g.key)}
						<div class="rounded-xs border-l-2 bg-black/20 py-1" style:border-color={HUE[g.key]}>
							<div class="px-2 pb-1 text-xs font-semibold tracking-wide text-surface-100 uppercase">{g.label}</div>
							<div class="grid {cols} items-center gap-x-3 pr-2">
								{#each g.rows as row (row.group)}
									{@const key = `${side.label}:${row.group}`}
									<button
										type="button"
										class="flex min-w-0 items-baseline gap-1 rounded-xs px-2 py-0.5 text-left text-surface-200 hover:bg-white/[0.04] hover:text-surface-50"
										aria-expanded={!!open[key]}
										onclick={() => (open[key] = !open[key])}
									>
										<span class="inline-block w-3 shrink-0 text-xs text-surface-500">{open[key] ? '▾' : '▸'}</span><span class="truncate">{row.label}</span>
									</button>
									<span class="h-1.5 w-full rounded-full bg-white/[0.06] max-sm:hidden" title={`${row.label}: ${formatCp(row.cp)} CP (${share(row.cp).toFixed(1)}%)`}>
										<span class="block h-full rounded-full" style:width={`${Math.max(0, (row.cp / top) * 100)}%`} style:background-color={HUE[g.key]}></span>
									</span>
									<span class="{line} text-surface-300">{formatPct(row.pct)}%</span>
									<span class="{line} text-surface-100">{formatCp(row.cp)}</span>
									<span class="{line} text-xs text-surface-400">{share(row.cp).toFixed(1)}%</span>
									{@render changeCell(row.change)}
									{#if open[key]}
										<!-- Its parts, as rows of the same grid: each part's bonus sits under Bonus. -->
										{#each row.items as item (item.label)}
											<span class="truncate pl-9 text-xs text-surface-400">{item.label}{item.count > 1 ? ` ×${item.count}` : ''}</span>
											<span class="max-sm:hidden"></span>
											<span class="{line} text-xs text-surface-400">{formatPct(item.pct)}%</span>
											<span class={line}></span>
											<span class={line}></span>
											{#if changed}<span class="{line} max-sm:hidden"></span>{/if}
										{/each}
										{#if !row.items.length}<span class="col-span-full pl-9 text-xs text-surface-400">Removed by your changes.</span>{/if}
									{/if}
								{/each}
								<!-- Subtotal: one full-width rule (cells in a grid leave gaps, so it can't be per-cell borders), then CP and share. -->
								<span class="col-span-full mt-0.5 border-t border-white/[0.07]"></span>
								<span></span>
								<span class="max-sm:hidden"></span>
								<!-- No combined bonus: bonuses multiply, so one number here wouldn't match the rows above. -->
								<span class="{line} pt-0.5"></span>
								<span class="{line} pt-0.5 font-semibold text-surface-100">{formatCp(g.cp)}</span>
								<span class="{line} pt-0.5 text-xs font-semibold text-surface-200">{share(g.cp).toFixed(1)}%</span>
								{#if changed}<span class="{line} pt-0.5 text-xs max-sm:hidden {color(g.change)}">{Math.abs(g.change) > 0.00005 ? `${formatPct(g.change)}%` : '—'}</span>{/if}
							</div>
						</div>
					{/each}

					<!-- The sum: base plus every group's share. -->
					<div class="grid {cols} items-center gap-x-3 rounded-xs border-t-2 border-surface-600 px-2 pt-1.5">
						<span class="font-bold text-surface-100">{breakdown.sides.length > 1 ? side.label : 'Combat Power'}</span>
						<span class="max-sm:hidden"></span>
						<span class={line}></span>
						<span class="{line} text-base font-bold {breakdown.sides.length > 1 ? (side.label === 'Buff Power' ? 'text-sky-300' : 'text-red-300') : support ? 'text-green-400' : 'text-red-400'}">{formatCp(side.total)}</span>
						<span class="{line} text-xs font-semibold text-surface-200">{share(side.total).toFixed(1)}%</span>
						{#if changed}
							{@const delta = breakdown.sides.length > 1 ? 0 : (total / current - 1) * 100}
							<span class="{line} text-xs max-sm:hidden {color(delta)}">{Math.abs(delta) > 0.00005 ? `${formatPct(delta)}%` : '—'}</span>
						{/if}
					</div>
				</section>
			{/each}
			{#if breakdown.sides.length > 1}
				<!-- Supports: the score is the two halves added together. -->
				<section aria-label="Combat Power" class="tabular-nums">
					<div class="grid {cols} items-center gap-x-3 px-2 text-sm">
						{#each breakdown.sides as side (side.label)}
							<span class={side.label === 'Buff Power' ? 'text-sky-300' : 'text-red-300'}>{side.label}</span>
							<span class="max-sm:hidden"></span>
							<span class={line}></span>
							<span class="{line} text-surface-100">{formatCp(side.total)}</span>
							<span class="{line} text-xs text-surface-400">{share(side.total).toFixed(1)}%</span>
							{#if changed}<span class="{line} max-sm:hidden"></span>{/if}
						{/each}
					</div>
					<div class="mt-1 grid {cols} items-center gap-x-3 border-t-2 border-surface-600 px-2 pt-1.5">
						<span class="font-bold text-surface-100">Combat Power</span>
						<span class="max-sm:hidden"></span>
						<span class={line}></span>
						<span class="{line} text-base font-bold text-green-400">{formatCp(total)}</span>
						<span class="{line} text-xs font-semibold text-surface-200">100.0%</span>
						{#if changed}
							{@const delta = (total / current - 1) * 100}
							<span class="{line} text-xs max-sm:hidden {color(delta)}">{Math.abs(delta) > 0.00005 ? `${formatPct(delta)}%` : '—'}</span>
						{/if}
					</div>
				</section>
			{/if}
			{#if Math.abs(breakdown.anchor - 1) > 0.0005}
				<p class="text-xs text-surface-500">
					The formula lands {formatPct((1 / breakdown.anchor - 1) * 100, 2)}% off your in-game score, so every number above is scaled by
					×{breakdown.anchor.toFixed(4)} to match it.
				</p>
			{/if}
		</div>
	</div>
</dialog>
