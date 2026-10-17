<!--
	Compact popover picker with a custom trigger. Options can carry an icon, a color and a CP preview.
	Used where a full-width line picker would be too big (engraving chips, astrogem options, gem skills).
-->
<script lang="ts" generics="T extends string | number">
	import { getContext, tick, type Snippet } from 'svelte';
	import { formatPct } from '../format';
	import Glyph from './Glyph.svelte';
	import { placeMenu } from './place-menu';
	import type { MenuOption } from './ui';

	let {
		value,
		options,
		onpick,
		trigger,
		label,
		changed = false,
		tone = 'default',
		repick = false,
		fitMenu = false,
		naming = $bindable(null),
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
		tone?: 'default' | 'purple';
		/** Re-selecting a saved plan restores it even after editing it. */
		repick?: boolean;
		/** Match the dropdown to the selector width. */
		fitMenu?: boolean;
		naming?: T | null;
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
	let nameText = $state('');
	let nameInput = $state<HTMLInputElement>();
	$effect(() => {
		if (naming !== null) {
			open = true; nameText = options.find(o => o.value === naming)?.onrename ? options.find(o => o.value === naming)!.label : '';
			void tick().then(() => nameInput?.focus());
		}
	});
	function finishName(option = options.find(o => o.value === naming)) {
		if (!option || !(option.onsave || option.onrename)) return;
		const title = naming === option.value ? nameText.trim() : option.label;
		if (!title) return;
		if ((option.onsave ?? option.onrename)?.(title)) { naming = null; open = false; }
	}

	// Long single-column lists (skills, engravings) get a search box.
	/** Options with a remove action (kept snapshots) get an × beside them. */
	const saveActions = $derived(options.some(o => o.onsave || o.onrename));
	const removable = $derived(options.some((o) => o.onremove || o.onsave || o.onrename || o.locked));
	/** Multi-column pickers (core points, gem tiers) lay options out as compact cells. */
	const cells = $derived(columns > 1);
	const searchable = $derived(columns === 1 && !options.some((o) => o.row) && options.length >= 12);
	let query = $state('');
	let search = $state<HTMLInputElement>();
	const shown = $derived(
		query.trim() ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase())) : options
	);
	async function toggle() {
		open = !open;
		query = '';
		if (open && searchable && !window.matchMedia('(pointer: coarse)').matches) {
			await tick();
			search?.focus({ preventScroll: true });
		}
	}
	let root: HTMLDivElement;
	const previews = $derived(open && preview ? new Map(options.filter((o) => !o.disabled).map((o) => [o.value, preview(o.value)])) : new Map<T, number>());
	/** Row-laid-out pickers: one labelled row per `row`, its options as compact cells. */
	const rows = $derived(options.some((o) => o.row) ? [...new Set(options.map((o) => o.row ?? ''))] : null);
	const pick = (v: T) => {
		const option = options.find(o => o.value === v);
		if (option?.disabled) return;
		if (option?.onsave || option?.onrename) { naming = v; return; }
		open = false;
		if (v !== value || repick) onpick(v);
	};
</script>

<svelte:window
	onclick={(e) => open && !root.contains(e.target as Node) && (open = false)}
	onkeydown={(e) => {
		if (open && e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			open = false;
		}
	}}
/>

<div class="relative min-w-0 max-w-full {full ? 'flex w-full' : 'inline-flex'}" bind:this={root}>
	<button
		type="button"
		class="inline-flex max-w-full min-w-0 items-center rounded-xs {iconOnly ? 'h-9 p-0 hover:ring-2 hover:ring-accent-400 hover:ring-offset-2 hover:ring-offset-surface-950 focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-950' : 'h-8 gap-1.5 px-2 max-[360px]:gap-1 max-[360px]:px-1'} {full ? 'w-full' : ''} border text-sm transition {tone === 'purple' ? 'border-violet-500/60 bg-violet-500/10 text-violet-200 hover:border-violet-400 hover:bg-violet-500/20' : `bg-surface-800/80 hover:border-accent-500 hover:bg-surface-700/80 ${changed
			? 'border-accent-500 bg-accent-500/15'
			: 'border-surface-600'}`}"
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
				use:placeMenu={{ align, fit: fitMenu }}
				popover="manual"
				style:color="var(--color-surface-100)"
				role="listbox"
				aria-label={label}
				class="absolute top-full z-40 mt-1 flex w-max max-w-[92vw] overflow-auto overscroll-contain flex-col gap-0.5 rounded-xs border border-surface-600 bg-surface-900 p-1.5 shadow-xl shadow-black/70 {align === 'right' ? 'right-0' : 'left-0'}"
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
								onclick={(e) => { e.stopPropagation(); pick(o.value); }}
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
			use:placeMenu={{ align, fit: fitMenu }}
			popover="manual"
			style:color="var(--color-surface-100)"
			role="listbox"
			aria-label={label}
			class="absolute top-full z-40 mt-1 grid max-h-80 w-max max-w-[min(26rem,92vw)] gap-px overflow-auto overscroll-contain rounded-xs border border-surface-600 bg-surface-900 p-1 shadow-xl shadow-black/70 {align === 'right' ? 'right-0' : 'left-0'}"
			style:grid-template-columns={cells ? `repeat(${columns}, minmax(max-content, 1fr))` : 'minmax(0, 1fr)'}
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
			<!-- One column: the track can shrink (labels cut off) so the menu fits a phone; cells keep their full width. -->
			{#each shown as o (o.value)}
				{#snippet option()}
					<button
						type="button"
						role="option"
						aria-selected={o.value === value}
						disabled={o.disabled}
						title={o.title}
						class:opacity-40={o.disabled}
						class:cursor-not-allowed={o.disabled}
						class="flex min-w-0 {removable ? 'flex-1' : ''} rounded-xs text-sm hover:bg-surface-800 {saveActions ? 'w-full flex-wrap' : ''} {cells ? 'min-w-12 flex-col items-center justify-center px-1.5 py-1 font-semibold leading-tight' : 'flex-row items-center gap-2 px-2.5 py-1.5 text-left'} {o.value === value ? 'bg-surface-800 ring-1 ring-accent-500/60' : ''} {o.muted ? 'text-surface-400' : ''}"
						style:color={o.color}
						onclick={(e) => { e.stopPropagation(); pick(o.value); }}
					>
						{#if saveActions}
 <span class="w-full min-w-0 truncate font-semibold">{o.label}</span>
 {#if o.note || o.detail}<span class="flex w-full min-w-0 items-center justify-between gap-3 text-xs">
  <span class="shrink-0 text-surface-400">{o.note ?? ''}</span>
  {#if o.detail}<span class="shrink-0 whitespace-nowrap tabular-nums" style:color={o.detail.color}>{o.detail.label}</span>{/if}
 </span>{/if}
 {:else}
						{#if o.glyph}<Glyph kind={o.glyph} dim={o.muted} />{/if}
						{#if o.iconUrl}<img src={o.iconUrl} alt="" class="size-6 shrink-0 rounded-xs" loading="lazy" />{/if}
						{#if o.marker !== undefined}<span class="flex w-2.5 shrink-0 justify-center">{#if o.marker}<svg class="size-2.5" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1.5L9 8.5H1z" fill={o.marker} /></svg>{/if}</span>{/if}
						<span class="whitespace-nowrap {cells ? '' : 'min-w-0 flex-1 truncate'}">{o.label}{#if o.suffix}<span class="ml-1" style:color={o.suffix.color}>{o.suffix.label}</span>{/if}</span>
						{#if o.note !== undefined}<span class="w-14 shrink-0 pl-2 whitespace-nowrap text-surface-400">{o.note}</span>{/if}
						{#if o.detail}<span class="pl-3 text-right tabular-nums" style:color={o.detail.color}>{o.detail.label}</span>{/if}
						{#if previews.has(o.value) && o.value !== value}
							{@const p = previews.get(o.value)!}
							<!-- Cells (core points) stack % and raw CP under the label so they stay narrow. -->
							<span class="flex {cells ? 'flex-col items-center font-normal' : 'flex-row items-baseline gap-2'}">
								<span class="{cells ? 'text-[10px]' : 'text-xs font-semibold'} tabular-nums {p > 0.005 ? 'text-green-400' : p < -0.005 ? 'text-red-400' : 'text-surface-500'}">{formatPct(p)}%</span>
								{#if raw(p)}<span class="text-surface-400 tabular-nums {cells ? 'text-[10px]' : 'w-12 text-right text-xs'}">{raw(p)}</span>{/if}
							</span>
						{/if}
 {/if}
					</button>
				{/snippet}
 {#if saveActions}
 <div class="saved-entry {o.onsave ? 'saved-current' : ''} {naming === o.value ? 'saved-naming' : ''} {o.value === value ? 'bg-surface-800/60' : ''}">
  {#if naming === o.value}
   <input bind:this={nameInput} bind:value={nameText} aria-label="Simulation name" placeholder="Simulation name" maxlength="80" class="saved-name-input h-8 min-w-0 rounded-xs border border-violet-400 bg-surface-800 px-2 text-base text-surface-100 sm:text-sm" onkeydown={e => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finishName(o); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); naming = null; }
   }} />
  {:else}
   <div class="saved-main flex min-w-0 items-center gap-2">
    <button type="button" role="option" aria-selected={o.value === value} disabled={o.disabled} title={o.onrename ? 'Click to rename' : o.title ?? o.label}
     class="saved-name min-w-0 truncate py-1 text-left text-sm hover:text-surface-50 {o.onrename ? 'cursor-text' : ''}" onclick={e => { e.stopPropagation(); naming = o.value; }}>{o.label}</button>
    <button type="button" class="h-6 shrink-0 rounded-xs border border-violet-400/50 bg-violet-500/30 px-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/45 disabled:opacity-40" disabled={o.loadDisabled} aria-label={`${o.onsave ? 'Save' : 'Load'} ${o.label}`} onclick={e => { e.stopPropagation(); if (o.onsave) naming = o.value; else { o.onload?.(); open = false; } }}>{o.onsave ? 'Save' : 'Load'}</button>
   </div>
   <span class="saved-date whitespace-nowrap text-xs text-surface-400">{o.note ?? ''}</span>
   <span class="saved-cp whitespace-nowrap text-right text-xs tabular-nums" style:color={o.detail?.color}>{o.detail?.label ?? ''}</span>
  {/if}
  <div class="saved-actions flex items-center justify-end gap-0.5">
   {#if naming === o.value}
    <button type="button" class="h-8 px-2 text-xs text-surface-300 hover:bg-surface-800" onclick={e => { e.stopPropagation(); naming = null; }}>Cancel</button>
    <button type="button" class="h-8 px-2 text-xs text-accent-200 hover:bg-surface-800" aria-label={`Save ${o.label}`} onclick={e => { e.stopPropagation(); finishName(o); }}>Save</button>
   {:else}
    {#if o.onpin}<button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-xs hover:bg-surface-800 {o.pinned ? 'text-accent-300' : 'text-surface-400 hover:text-surface-100'}" aria-pressed={o.pinned === true} aria-label={`${o.pinned ? 'Unpin' : 'Pin'} ${o.label} ${o.pinned ? 'from' : 'to'} character list`} title={o.pinned ? 'Unpin from character list' : 'Pin to character list'} onclick={e => { e.stopPropagation(); o.onpin?.(); }}>
     <svg viewBox="0 0 24 24" class="size-4" fill={o.pinned ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-3 1-4 5v4l-2 2-3-5-5-3 2-2h4l5-4z"/><path d="m8 16-5 5"/></svg>
    </button>{/if}
    {#if o.onremove}<button type="button" class="flex size-8 shrink-0 items-center justify-center text-surface-500 hover:bg-surface-800 hover:text-red-300" aria-label={o.removeLabel ?? `Delete ${o.label}`} onclick={e => { e.stopPropagation(); o.onremove?.(); }}>✕</button>{/if}
   {/if}
  </div>
 </div>
 {:else if removable}
					<!-- Removable rows (kept snapshots): an × beside the option; the others keep its space so columns line up. -->
					<div class="flex min-w-0 flex-row items-center {saveActions ? 'gap-1' : ''}">
						{#if naming === o.value}
							<input bind:this={nameInput} bind:value={nameText} onblur={() => { if (!nameText.trim()) naming = null; }} aria-label="Simulation name" placeholder="Simulation name" maxlength="80" class="h-8 min-w-0 flex-1 rounded-xs border border-violet-400 bg-surface-800 px-2 text-sm text-surface-100 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-violet-400" onkeydown={(e) => {
								if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finishName(); }
								else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); naming = null; }
							}} />
						{:else}{@render option()}{/if}
						{#if o.onpin}<button type="button" class="flex h-8 shrink-0 items-center px-2 text-xs text-accent-300 hover:bg-surface-800" aria-label={`${o.pinned ? 'Unpin' : 'Pin'} ${o.label} ${o.pinned ? 'from' : 'to'} character list`} title={o.pinned ? 'Unpin from character list' : 'Pin to character list'} onclick={e => { e.stopPropagation(); o.onpin?.(); }}>{o.pinned ? 'Unpin' : 'Pin'}</button>{/if}
 {#if o.onsave || o.onrename}
							<button type="button" class="flex h-8 w-12 shrink-0 items-center justify-center rounded-xs text-xs text-surface-300 hover:bg-surface-800 hover:text-surface-100 disabled:opacity-40" disabled={naming !== o.value && o.loadDisabled} aria-label={`${o.onsave || naming === o.value ? 'Save' : 'Load'} ${o.label}`} onclick={(e) => { e.stopPropagation(); if (o.onsave || naming === o.value) finishName(o); else { o.onload?.(); open = false; } }}>{o.onsave || naming === o.value ? 'Save' : 'Load'}</button>
							{#if o.onremove}<button type="button" class="flex size-7 shrink-0 items-center justify-center rounded-xs text-surface-500 hover:bg-surface-800 hover:text-red-300" aria-label={o.removeLabel ?? `Remove ${o.label}`} onclick={(e) => { e.stopPropagation(); o.onremove?.(); }}>✕</button>{:else}<span class="w-7 shrink-0"></span>{/if}
						{:else if o.onremove}
							<button
								type="button"
								class="flex {saveActions ? 'h-8 w-12' : 'size-7'} shrink-0 items-center justify-center rounded-xs text-surface-500 hover:bg-surface-800 hover:text-red-300"
								aria-label={o.removeLabel ?? `Remove ${o.label}`}
								title={o.removeLabel ?? `Remove ${o.label}`}
								onclick={(e) => {
									e.stopPropagation();
									o.onremove?.();
								}}
							>✕</button>
						{:else if o.locked}
							<span class="flex {saveActions ? 'h-8 w-12' : 'size-7'} shrink-0 items-center justify-center text-surface-500" title={o.locked} aria-label={o.locked}>
								<svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.2" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>
							</span>
						{:else}<span class="{saveActions ? 'w-12' : 'w-7'} shrink-0"></span>{/if}
					</div>
				{:else}
					{@render option()}
				{/if}
			{/each}
		</div>
		{/if}
	{/if}
</div>

<style>
 .saved-entry { display: grid; width: 32rem; max-width: 100%; grid-template-columns: minmax(6rem, 1fr) 3rem 5rem 4.25rem; align-items: center; column-gap: .5rem; padding: .125rem .5rem; border-bottom: 1px solid var(--color-surface-700); }
 .saved-entry:last-child { border-bottom: 0; }
 .saved-name-input { grid-column: 1 / 4; }
 .saved-actions { grid-column: 4; }
 .saved-naming { grid-template-columns: minmax(0, 1fr) auto; }
 .saved-naming .saved-name-input { grid-column: 1; }
 .saved-naming .saved-actions { grid-column: 2; }
 @media (max-width: 639px) {
  .saved-entry { width: 24rem; grid-template-columns: minmax(0, 1fr) 5rem 4.25rem; column-gap: .5rem; padding: .25rem .5rem; }
  .saved-main { grid-column: 1 / -1; grid-row: 1; }
  .saved-cp { grid-column: 2; grid-row: 2; }
  .saved-date { grid-column: 1; grid-row: 2; }
  .saved-actions { grid-column: 3; grid-row: 2; }
  .saved-current .saved-date, .saved-current .saved-cp, .saved-current .saved-actions { display: none; }
  .saved-naming .saved-name-input { grid-column: 1 / -1; grid-row: 1; width: 100%; }
  .saved-naming .saved-actions { display: flex; grid-column: 1 / -1; grid-row: 2; }
 }
</style>
