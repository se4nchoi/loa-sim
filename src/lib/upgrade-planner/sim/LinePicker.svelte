<!--
	Dropdown styled like lostark.bible's accessory lines: each line has a 2px left border in its roll color.
	Every option can show the exact CP change it would cause, so lines can be compared at a glance.
-->
<script lang="ts">
	import { formatPct } from '../format';
	import type { PickOption } from './ui';

	let {
		value,
		options,
		onpick,
		preview,
		label,
		changed = false
	}: {
		value: string;
		options: PickOption[];
		onpick: (value: string) => void;
		/** CP change in percent if this option were picked (relative to the current simulation). */
		preview?: (value: string) => number;
		label: string;
		changed?: boolean;
	} = $props();

	let open = $state(false);
	let root: HTMLDivElement;
	const current = $derived(options.find((o) => o.value === value));
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

<div class="relative min-w-0" bind:this={root}>
	<button
		type="button"
		class="flex w-full min-w-0 flex-row items-center gap-1 rounded-xs py-0.5 pr-1 text-left transition hover:bg-black/20 {changed ? 'bg-accent-500/10 ring-1 ring-accent-500' : ''}"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-label={label}
		onclick={() => (open = !open)}
	>
		<span class="min-w-0 flex-1 truncate border-l-2 pl-2 text-xs sm:text-sm" style:border-color={current?.color ?? '#575757'}>
			{current?.label ?? 'Unknown'}
		</span>
		<svg class="size-3 shrink-0 text-surface-400" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2 4l4 4 4-4z" /></svg>
	</button>
	{#if open}
		<div
			role="listbox"
			aria-label={label}
			class="absolute top-full left-0 z-30 mt-1 max-h-80 w-max max-w-[min(26rem,90vw)] min-w-full overflow-y-auto rounded-xs border border-surface-700 bg-surface-900 py-1 shadow-lg shadow-black/60"
		>
			{#each groups as g (g)}
				{#if g}<div class="px-2 pt-1.5 pb-0.5 text-[11px] font-semibold tracking-wide text-surface-400 uppercase">{g}</div>{/if}
				{#each options.filter((o) => (o.group ?? '') === g) as o (o.value)}
					<button
						type="button"
						role="option"
						aria-selected={o.value === value}
						class="flex w-full flex-row items-center gap-3 px-2 py-1 text-left hover:bg-black/30 {o.value === value ? 'bg-black/20' : ''}"
						onclick={() => pick(o.value)}
					>
						<span class="flex-1 border-l-2 pl-2 text-xs sm:text-sm" style:border-color={o.color}>{o.label}</span>
						{#if previews[o.value] !== undefined && o.value !== value}
							<span class="text-xs whitespace-nowrap {previewClass(previews[o.value])}">{formatPct(previews[o.value])}%</span>
						{/if}
					</button>
				{/each}
			{/each}
		</div>
	{/if}
</div>
