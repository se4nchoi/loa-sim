<!--
	Dropdown styled like lostark.bible's accessory lines: each line has a 2px left border in its roll color.
	Every option can show the exact CP change it would cause, so lines can be compared at a glance.
-->
<script lang="ts">
	import { getContext, tick } from 'svelte';
	import { formatPct } from '../format';
	import { placeMenu } from './place-menu';
	import type { PickOption } from './ui';

	let {
		value,
		display,
		options,
		onpick,
		preview,
		label,
		changed = false,
		plain = false
	}: {
		value: string;
		/** What the closed picker shows; defaults to the selected option's label. */
		display?: { label: string; color: string; textColor?: string };
		options: PickOption[];
		onpick: (value: string) => void;
		/** CP change in percent if this option were picked (relative to the current simulation). */
		preview?: (value: string) => number;
		label: string;
		changed?: boolean;
		/** No roll-colored left border (pickers that aren't accessory lines, e.g. the Paradise orb). */
		plain?: boolean;
	} = $props();
	const edge = $derived(plain ? '' : 'border-l-2 pl-2');

	// Long lists (bracelet effects) get a search box.
	const SEARCH_MIN = 12;
	const cpNow = getContext<(() => number) | undefined>('loa-sim:cp');

	let open = $state(false);
	let query = $state('');
	let root: HTMLDivElement;
	let search = $state<HTMLInputElement>();
	const current = $derived(display ?? options.find((o) => o.value === value));
	const shown = $derived(
		query.trim() ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase())) : options
	);
	const groups = $derived([...new Set(shown.map((o) => o.group ?? ''))]);
	const previews = $derived(open && preview ? Object.fromEntries(options.map((o) => [o.value, preview(o.value)])) : {});

	async function toggle() {
		open = !open;
		query = '';
		// Phones would pop the keyboard over the list; they scroll it instead.
		if (open && !window.matchMedia('(pointer: coarse)').matches) {
			await tick();
			search?.focus({ preventScroll: true });
		}
	}
	function pick(v: string) {
		open = false;
		if (v !== value) onpick(v);
	}
	const previewClass = (pct: number) => (pct > 0.005 ? 'text-green-400' : pct < -0.005 ? 'text-red-400' : 'text-surface-500');
</script>

<svelte:window
	onclick={(e) => open && !root.contains(e.target as Node) && (open = false)}
	onkeydown={(e) => open && e.key === 'Escape' && (open = false)}
/>

<div class="relative min-w-0 flex-1" bind:this={root}>
	<button
		type="button"
		class="flex h-8 w-full min-w-0 flex-row items-center gap-2 rounded-xs border bg-surface-800/60 pr-2 text-left transition hover:border-accent-500 hover:bg-surface-800 {changed
			? 'border-accent-500 bg-accent-500/10'
			: 'border-surface-700'}"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-label={label}
		onclick={toggle}
	>
		<span class="{plain ? 'ml-2.5' : 'ml-1.5'} min-w-0 flex-1 truncate {edge} text-sm" style:border-color={current?.color ?? '#575757'} style:color={current?.textColor} title={current?.label}>
			{current?.label ?? 'Unknown'}
		</span>
		<svg class="size-3.5 shrink-0 text-surface-400" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2 4l4 4 4-4z" /></svg>
	</button>
	{#if open}
		<div
			use:placeMenu
			popover="manual"
			style:color="var(--color-surface-100)"
			role="listbox"
			aria-label={label}
			class="absolute top-full left-0 z-40 mt-1 max-h-96 w-max max-w-[min(30rem,92vw)] min-w-full overflow-y-auto overscroll-contain rounded-xs border border-surface-600 bg-surface-900 py-1 shadow-xl shadow-black/70"
		>
			{#if options.length >= SEARCH_MIN}
				<div class="sticky top-0 z-10 bg-surface-900 px-2 pt-1 pb-1.5">
					<input
						bind:this={search}
						bind:value={query}
						type="search"
						placeholder="Search…"
						aria-label={`Search ${label}`}
						class="h-8 w-full rounded-xs border border-surface-600 bg-surface-950 px-2 text-sm text-surface-100 focus:border-accent-500 focus:outline-none"
						onkeydown={(e) => e.key === 'Enter' && shown[0] && pick(shown[0].value)}
					/>
				</div>
			{/if}
			{#if !shown.length}<p class="px-3 py-2 text-sm text-surface-400">No matches.</p>{/if}
			{#each groups as g (g)}
				{#if g}<div class="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-surface-400 uppercase">{g}</div>{/if}
				{#each shown.filter((o) => (o.group ?? '') === g) as o (o.value)}
					<button
						type="button"
						role="option"
						aria-selected={o.value === value}
						class="flex w-full flex-row items-center gap-3 px-3 py-2 text-left hover:bg-surface-800 {o.value === value ? 'bg-surface-800/70' : ''}"
						onclick={() => pick(o.value)}
					>
						<span class="flex flex-1 flex-row items-center gap-2 {edge} text-sm" style:border-color={o.color}>
							{#if o.iconUrl}<img src={o.iconUrl} alt="" class="size-6 shrink-0 rounded-xs" loading="lazy" />{/if}
							<span class="sm:whitespace-nowrap" style:color={o.textColor}>{o.label}</span>
						</span>
						{#if o.detail}<span class="w-24 text-right text-xs whitespace-nowrap tabular-nums" style:color={o.detail.color}>{o.detail.label}</span>{/if}
						{#if o.value === value}
							<span class="text-xs text-surface-400">current</span>
						{:else if previews[o.value] !== undefined}
							<span class="text-sm font-semibold whitespace-nowrap tabular-nums {previewClass(previews[o.value])}">{formatPct(previews[o.value])}%</span>
							{#if cpNow}<span class="w-12 text-right text-xs whitespace-nowrap text-surface-400 tabular-nums">{formatPct((cpNow() * previews[o.value]) / 100, 1)}</span>{/if}
						{/if}
					</button>
				{/each}
			{/each}
		</div>
	{/if}
</div>
