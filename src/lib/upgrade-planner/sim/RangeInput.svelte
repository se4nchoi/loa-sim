<!-- Slider plus number box for values with a known range (e.g. an accessory's main stat). -->
<script lang="ts">
	import { onDestroy } from 'svelte';
	let {
		value = $bindable(),
		min,
		max,
		label,
		changed = false,
		compact = false
	}: { value: number; min: number; max: number; label: string; changed?: boolean; compact?: boolean } = $props();
	let draft = $state(value);
	let timer: ReturnType<typeof setTimeout> | undefined;
	const cancel = () => { clearTimeout(timer); timer = undefined; };
	const commit = (next: number) => { cancel(); draft = next; value = next; };
	const drag = (next: number) => {
		draft = next;
		cancel();
		timer = setTimeout(() => commit(draft), 500);
	};
	$effect(() => { const next = value; cancel(); draft = next; });
	onDestroy(cancel);

	// Values from the game can sit slightly outside the published range; let the slider show them.
	const lo = $derived(Math.min(min, value));
	const hi = $derived(Math.max(max, value));
	const fill = $derived(((draft - lo) / Math.max(1, hi - lo)) * 100);
</script>

<div
	class="flex min-w-0 flex-1 rounded-xs border border-dashed border-surface-700 px-2 py-1.5 {compact ? 'flex-row items-center gap-3' : 'flex-col gap-1'} {changed
		? 'border-accent-500 bg-accent-500/10'
		: ''}"
>
	<div class="flex flex-row items-center justify-between gap-2 {compact ? 'order-last' : ''}">
		{#if !compact}<span class="text-xs text-surface-400">{label}</span>{/if}
		<label
			class="flex h-7 cursor-text flex-row items-center gap-1 rounded-xs border border-surface-600 bg-surface-800 px-1.5 transition hover:border-accent-500 focus-within:border-accent-500 focus-within:ring-1 focus-within:ring-accent-500"
			title="Type a value, or drag the slider"
		>
			<svg class="size-3 shrink-0 text-surface-400" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
				<path d="M11.7 1.3a1 1 0 0 1 1.4 0l1.6 1.6a1 1 0 0 1 0 1.4L5.4 13.6 1.5 14.5l.9-3.9z" />
			</svg>
			<input
				type="number"
				min={lo}
				max={hi}
				class="w-16 bg-transparent text-right text-sm font-semibold text-accent-200 tabular-nums [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
				aria-label={label}
				value={draft}
				oninput={(e) => commit(Number(e.currentTarget.value) || 0)}
			/>
		</label>
	</div>
	<input
		type="range"
		min={lo}
		max={hi}
		step="1"
		class="h-2 w-full min-w-16 cursor-pointer appearance-none rounded-full bg-surface-700 accent-accent-500 {compact ? 'flex-1' : ''}"
		style:background="linear-gradient(to right, var(--color-accent-500) {fill}%, var(--color-surface-700) {fill}%)"
		aria-label={`${label} slider`}
		title={`${min.toLocaleString()} – ${max.toLocaleString()}`}
		value={draft}
		oninput={(e) => drag(Number(e.currentTarget.value))}
		onchange={(e) => commit(Number(e.currentTarget.value))}
	/>
	{#if compact}
		<span class="order-first w-16 shrink-0 text-xs text-surface-400">{label}</span>
	{:else}
		<div class="flex flex-row justify-between text-[10px] text-surface-500 tabular-nums">
			<span>{min.toLocaleString()}</span><span>{max.toLocaleString()}</span>
		</div>
	{/if}
</div>
