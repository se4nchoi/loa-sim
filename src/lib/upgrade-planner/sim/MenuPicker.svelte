<!--
	Compact popover picker with a custom trigger. Options can carry an icon, a color and a CP preview.
	Used where a full-width line picker would be too big (engraving chips, astrogem options, gem skills).
-->
<script lang="ts" generics="T extends string | number">
	import { getContext, tick, type Snippet } from 'svelte';
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
		columns = 1,
		full = false,
		iconOnly = false
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
		/** Fill the parent's width (equal-width pickers in a column). */
		full?: boolean;
		/** Use the supplied icon as the entire trigger. */
		iconOnly?: boolean;
	} = $props();

	// The simulated score, so a preview can show raw CP next to its percent.
	const cpNow = getContext<(() => number) | undefined>('loa-sim:cp');
	const raw = (pct: number) => (cpNow ? formatPct((cpNow() * pct) / 100, 1) : null);

	let open = $state(false);
	// Long single-column lists (skills, engravings) get a search box.
	const searchable = $derived(columns === 1 && !options.some((o) => o.row) && options.length >= 12);
	let query = $state('');
	let search = $state<HTMLInputElement>();
	const shown = $derived(
		query.trim() ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase())) : options
	);
	async function toggle() {
		open = !open;
		query = '';
		if (open && searchable) {
			await tick();
			search?.focus();
		}
	}
	let root: HTMLDivElement;
	/** Clamp popovers to the viewport, even when a right-aligned trigger is near its left edge. */
	function placeMenu(node: HTMLDivElement) {
		const place = () => {
			if (!node.isConnected) return;
			const margin = 8;
			const anchor = root.getBoundingClientRect();
			node.style.position = 'fixed';
			node.style.right = 'auto';
			node.style.maxWidth = `${window.innerWidth - margin * 2}px`;
			node.style.minWidth = `${Math.min(anchor.width, window.innerWidth - margin * 2)}px`;
			const box = node.getBoundingClientRect();
			const left = align === 'right' ? anchor.right - box.width : anchor.left;
			node.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - box.width - margin))}px`;
			const below = window.innerHeight - anchor.bottom - margin - 4;
			const above = anchor.top - margin - 4;
			const flip = below < Math.min(box.height, 200) && above > below;
			node.style.maxHeight = `${Math.max(0, flip ? above : below)}px`;
			node.style.top = `${flip ? Math.max(margin, anchor.top - Math.min(box.height, above) - 4) : anchor.bottom + 4}px`;
			node.style.marginTop = '0';
		};
		void tick().then(place);
		window.addEventListener('resize', place);
		window.addEventListener('scroll', place, true);
		return { destroy() {
			window.removeEventListener('resize', place);
			window.removeEventListener('scroll', place, true);
		} };
	}
	const previews = $derived(open && preview ? new Map(options.filter((o) => !o.disabled).map((o) => [o.value, preview(o.value)])) : new Map<T, number>());
	/** Row-laid-out pickers: one labelled row per `row`, its options as compact cells. */
	const rows = $derived(options.some((o) => o.row) ? [...new Set(options.map((o) => o.row ?? ''))] : null);
	const pick = (v: T) => {
		if (options.find((o) => o.value === v)?.disabled) return;
		open = false;
		if (v !== value) onpick(v);
	};
</script>

<svelte:window
	onclick={(e) => open && !root.contains(e.target as Node) && (open = false)}
	onkeydown={(e) => open && e.key === 'Escape' && (open = false)}
/>

<div class="relative min-w-0 max-w-full {full ? 'flex w-full' : 'inline-flex'}" bind:this={root}>
	<button
		type="button"
		class="inline-flex max-w-full min-w-0 items-center rounded-xs {iconOnly ? 'h-9 p-0 hover:ring-2 hover:ring-accent-400 hover:ring-offset-2 hover:ring-offset-surface-950 focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-950' : 'h-8 gap-1.5 px-2 max-[360px]:gap-1 max-[360px]:px-1'} {full ? 'w-full' : ''} border bg-surface-800/80 text-sm transition hover:border-accent-500 hover:bg-surface-700/80 {changed
			? 'border-accent-500 bg-accent-500/15'
			: 'border-surface-600'}"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-label={label}
		onclick={toggle}
	>
		{@render trigger()}
		{#if !iconOnly}<svg class="size-3 shrink-0 text-surface-400 {full ? 'ml-auto' : ''}" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2 4l4 4 4-4z" /></svg>{/if}
	</button>
	{#if open}
		{#if rows}
			<div
				use:placeMenu
				role="listbox"
				aria-label={label}
				class="absolute top-full z-40 mt-1 flex w-max max-w-[92vw] overflow-auto flex-col gap-0.5 rounded-xs border border-surface-600 bg-surface-900 p-1.5 shadow-xl shadow-black/70 {align === 'right' ? 'right-0' : 'left-0'}"
			>
				{#each rows as r (r)}
					{@const rowOpts = options.filter((o) => (o.row ?? '') === r)}
					<div class="flex flex-row items-center gap-1">
						<span class="w-36 min-w-0 truncate pr-1 text-xs {rowOpts[0]?.muted ? 'text-surface-500' : 'text-surface-200'}" title={r}>{r}</span>
						{#each rowOpts as o (o.value)}
							{@const p = previews.get(o.value)}
							<button
								type="button"
								role="option"
								aria-selected={o.value === value}
								disabled={o.disabled}
								title={o.title}
								class:opacity-40={o.disabled}
								class:cursor-not-allowed={o.disabled}
								aria-label={`${r} ${o.label}`}
								class="flex h-12 w-14 min-w-0 flex-col px-1 items-center justify-center rounded-xs text-sm font-semibold hover:bg-surface-800 {o.value === value
									? 'bg-accent-500/20 ring-1 ring-accent-500'
									: 'bg-surface-950'} {o.muted ? 'text-surface-400' : 'text-surface-50'}"
								onclick={() => pick(o.value)}
							>
								{o.label}
								{#if p !== undefined && o.value !== value}
									<span class="text-[10px] leading-tight font-normal tabular-nums {p > 0.005 ? 'text-green-400' : p < -0.005 ? 'text-red-400' : 'text-surface-500'}">{formatPct(p)}%</span>
									{#if raw(p)}<span class="text-[10px] leading-tight font-normal text-surface-400 tabular-nums">{raw(p)}</span>{/if}
								{/if}
							</button>
						{/each}
					</div>
				{/each}
			</div>
		{:else}
		<div
			use:placeMenu
			role="listbox"
			aria-label={label}
			class="absolute top-full z-40 mt-1 grid max-h-80 w-max max-w-[min(26rem,92vw)] gap-px overflow-auto rounded-xs border border-surface-600 bg-surface-900 p-1 shadow-xl shadow-black/70 {align === 'right' ? 'right-0' : 'left-0'}"
			style:grid-template-columns="repeat({columns}, minmax(max-content, 1fr))"
		>
			{#if searchable}
				<div class="sticky top-0 z-10 bg-surface-900 p-1" style:grid-column="1 / -1">
					<input
						bind:this={search}
						bind:value={query}
						type="search"
						placeholder="Search…"
						aria-label={`Search ${label}`}
						class="h-8 w-full rounded-xs border border-surface-600 bg-surface-950 px-2 text-sm text-surface-100 focus:border-accent-500 focus:outline-none"
							onkeydown={(e) => {
								const first = shown.find((o) => !o.disabled);
								if (e.key === 'Enter' && first) pick(first.value);
							}}
					/>
				</div>
				{#if !shown.length}<p class="px-2.5 py-2 text-sm text-surface-400">No matches.</p>{/if}
			{/if}
			{#each shown as o (o.value)}
				<button
					type="button"
					role="option"
					aria-selected={o.value === value}
					disabled={o.disabled}
					title={o.title}
					class:opacity-40={o.disabled}
					class:cursor-not-allowed={o.disabled}
					class="flex flex-row items-center gap-2 rounded-xs px-2.5 py-2 text-left text-sm hover:bg-surface-800 {o.value === value ? 'bg-surface-800 ring-1 ring-accent-500/60' : ''} {o.muted ? 'text-surface-400' : ''}"
					style:color={o.color}
					onclick={() => pick(o.value)}
				>
					{#if o.glyph}<Glyph kind={o.glyph} dim={o.muted} />{/if}
					{#if o.iconUrl}<img src={o.iconUrl} alt="" class="size-6 shrink-0 rounded-xs" loading="lazy" />{/if}
					<span class="flex-1 whitespace-nowrap">{o.label}</span>
					{#if previews.has(o.value) && o.value !== value}
						{@const p = previews.get(o.value)!}
						<!-- Multi-column pickers (core points) stack % over raw CP so cells stay narrow. -->
						<span class="flex {columns > 1 ? 'flex-col items-end leading-tight' : 'flex-row items-baseline gap-2'}">
							<span class="text-xs font-semibold tabular-nums {p > 0.005 ? 'text-green-400' : p < -0.005 ? 'text-red-400' : 'text-surface-500'}">{formatPct(p)}%</span>
							{#if raw(p)}<span class="text-right text-xs text-surface-400 tabular-nums {columns > 1 ? 'text-[10px]' : 'w-12'}">{raw(p)}</span>{/if}
						</span>
					{/if}
				</button>
			{/each}
		</div>
		{/if}
	{/if}
</div>
