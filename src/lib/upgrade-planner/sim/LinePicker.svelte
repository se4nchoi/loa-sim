<!--
	Dropdown styled like lostark.bible's accessory lines: each line has a 2px left border in its roll color.
	Every option can show the exact CP change it would cause, so lines can be compared at a glance.
-->
<script lang="ts">
	import { formatPct } from '../format';
	import type { PickOption } from './ui';

	let {
		value,
		display,
		options,
		onpick,
		preview,
		label,
		changed = false
	}: {
		value: string;
		/** What the closed picker shows; defaults to the selected option's label. */
		display?: { label: string; color: string };
		options: PickOption[];
		onpick: (value: string) => void;
		/** CP change in percent if this option were picked (relative to the current simulation). */
		preview?: (value: string) => number;
		label: string;
		changed?: boolean;
	} = $props();

	let open = $state(false);
	let root: HTMLDivElement;
	const current = $derived(display ?? options.find((o) => o.value === value));
	const groups = $derived([...new Set(options.map((o) => o.group ?? ''))]);
	const previews = $derived(open && preview ? Object.fromEntries(options.map((o) => [o.value, preview(o.value)])) : {});

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
		class="flex h-9 w-full min-w-0 flex-row items-center gap-2 rounded-xs border bg-surface-950 pr-2 text-left transition hover:border-surface-500 {changed
			? 'border-accent-500 bg-accent-500/10'
			: 'border-surface-700'}"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-label={label}
		onclick={() => (open = !open)}
	>
		<span class="ml-1.5 min-w-0 flex-1 truncate border-l-2 pl-2 text-sm" style:border-color={current?.color ?? '#575757'}>
			{current?.label ?? 'Unknown'}
		</span>
		<svg class="size-3.5 shrink-0 text-surface-400" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2 4l4 4 4-4z" /></svg>
	</button>
	{#if open}
		<div
			role="listbox"
			aria-label={label}
			class="absolute top-full left-0 z-40 mt-1 max-h-96 w-max max-w-[min(30rem,92vw)] min-w-full overflow-y-auto rounded-xs border border-surface-600 bg-surface-900 py-1 shadow-xl shadow-black/70"
		>
			{#each groups as g (g)}
				{#if g}<div class="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-surface-400 uppercase">{g}</div>{/if}
				{#each options.filter((o) => (o.group ?? '') === g) as o (o.value)}
					<button
						type="button"
						role="option"
						aria-selected={o.value === value}
						class="flex w-full flex-row items-center gap-3 px-3 py-2 text-left hover:bg-surface-800 {o.value === value ? 'bg-surface-800/70' : ''}"
						onclick={() => pick(o.value)}
					>
						<span class="flex-1 border-l-2 pl-2 text-sm" style:border-color={o.color}>{o.label}</span>
						{#if o.value === value}
							<span class="text-xs text-surface-400">current</span>
						{:else if previews[o.value] !== undefined}
							<span class="text-sm font-semibold whitespace-nowrap tabular-nums {previewClass(previews[o.value])}">{formatPct(previews[o.value])}%</span>
						{/if}
					</button>
				{/each}
			{/each}
		</div>
	{/if}
</div>
