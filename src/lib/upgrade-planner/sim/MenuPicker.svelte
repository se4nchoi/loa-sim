<!--
	Compact popover picker with a custom trigger. Options can carry an icon, a color and a CP preview.
	Used where a full-width line picker would be too big (engraving chips, astrogem options, gem skills).
-->
<script lang="ts" generics="T extends string | number">
	import type { Snippet } from 'svelte';
	import { formatPct } from '../format';
	import Glyph from './Glyph.svelte';
	import type { MenuOption } from './ui';

	let {
		value,
		options,
		onpick,
		trigger,
		label,
		changed = false,
		preview,
		align = 'left',
		columns = 1
	}: {
		value: T;
		options: MenuOption<T>[];
		onpick: (v: T) => void;
		trigger: Snippet;
		label: string;
		changed?: boolean;
		preview?: (v: T) => number;
		align?: 'left' | 'right';
		columns?: number;
	} = $props();

	let open = $state(false);
	let root: HTMLDivElement;
	const previews = $derived(open && preview ? new Map(options.map((o) => [o.value, preview(o.value)])) : new Map<T, number>());
	/** Row-laid-out pickers: one labelled row per `row`, its options as compact cells. */
	const rows = $derived(options.some((o) => o.row) ? [...new Set(options.map((o) => o.row ?? ''))] : null);
	const pick = (v: T) => {
		open = false;
		if (v !== value) onpick(v);
	};
</script>

<svelte:window
	onclick={(e) => open && !root.contains(e.target as Node) && (open = false)}
	onkeydown={(e) => open && e.key === 'Escape' && (open = false)}
/>

<div class="relative inline-flex" bind:this={root}>
	<button
		type="button"
		class="inline-flex h-8 items-center gap-1.5 rounded-xs border bg-surface-800/80 px-2 text-sm transition hover:border-accent-500 hover:bg-surface-700/80 {changed
			? 'border-accent-500 bg-accent-500/15'
			: 'border-surface-600'}"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-label={label}
		onclick={() => (open = !open)}
	>
		{@render trigger()}
		<svg class="size-3 shrink-0 text-surface-400" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2 4l4 4 4-4z" /></svg>
	</button>
	{#if open}
		{#if rows}
			<div
				role="listbox"
				aria-label={label}
				class="absolute top-full z-40 mt-1 flex w-max max-w-[92vw] flex-col gap-0.5 rounded-xs border border-surface-600 bg-surface-900 p-1.5 shadow-xl shadow-black/70 {align === 'right' ? 'right-0' : 'left-0'}"
			>
				{#each rows as r (r)}
					{@const rowOpts = options.filter((o) => (o.row ?? '') === r)}
					<div class="flex flex-row items-center gap-1">
						<span class="w-36 shrink-0 truncate pr-1 text-xs {rowOpts[0]?.muted ? 'text-surface-500' : 'text-surface-200'}" title={r}>{r}</span>
						{#each rowOpts as o (o.value)}
							{@const p = previews.get(o.value)}
							<button
								type="button"
								role="option"
								aria-selected={o.value === value}
								aria-label={`${r} ${o.label}`}
								class="flex h-11 w-14 flex-col items-center justify-center rounded-xs text-sm font-semibold hover:bg-surface-800 {o.value === value
									? 'bg-accent-500/20 ring-1 ring-accent-500'
									: 'bg-surface-950'} {o.muted ? 'text-surface-400' : 'text-surface-50'}"
								onclick={() => pick(o.value)}
							>
								{o.label}
								{#if p !== undefined && o.value !== value}
									<span class="text-[10px] font-normal tabular-nums {p > 0.005 ? 'text-green-400' : p < -0.005 ? 'text-red-400' : 'text-surface-500'}">{formatPct(p)}%</span>
								{/if}
							</button>
						{/each}
					</div>
				{/each}
			</div>
		{:else}
		<div
			role="listbox"
			aria-label={label}
			class="absolute top-full z-40 mt-1 grid max-h-80 w-max max-w-[min(26rem,92vw)] min-w-full gap-px overflow-y-auto rounded-xs border border-surface-600 bg-surface-900 p-1 shadow-xl shadow-black/70 {align === 'right' ? 'right-0' : 'left-0'}"
			style:grid-template-columns="repeat({columns}, minmax(max-content, 1fr))"
		>
			{#each options as o (o.value)}
				<button
					type="button"
					role="option"
					aria-selected={o.value === value}
					class="flex flex-row items-center gap-2 rounded-xs px-2.5 py-2 text-left text-sm hover:bg-surface-800 {o.value === value ? 'bg-surface-800 ring-1 ring-accent-500/60' : ''} {o.muted ? 'text-surface-400' : ''}"
					style:color={o.color}
					onclick={() => pick(o.value)}
				>
					{#if o.glyph}<Glyph kind={o.glyph} dim={o.muted} />{/if}
					{#if o.iconUrl}<img src={o.iconUrl} alt="" class="size-6 shrink-0 rounded-xs" loading="lazy" />{/if}
					<span class="flex-1 whitespace-nowrap">{o.label}</span>
					{#if previews.has(o.value) && o.value !== value}
						{@const p = previews.get(o.value)!}
						<span class="text-xs font-semibold tabular-nums {p > 0.005 ? 'text-green-400' : p < -0.005 ? 'text-red-400' : 'text-surface-500'}">{formatPct(p)}%</span>
					{/if}
				</button>
			{/each}
		</div>
		{/if}
	{/if}
</div>
