<!-- Slider plus number box for values with a known range (e.g. an accessory's main stat). -->
<script lang="ts">
	let {
		value = $bindable(),
		min,
		max,
		label,
		changed = false
	}: { value: number; min: number; max: number; label: string; changed?: boolean } = $props();

	// Values from the game can sit slightly outside the published range; let the slider show them.
	const lo = $derived(Math.min(min, value));
	const hi = $derived(Math.max(max, value));
	const fill = $derived(((value - lo) / Math.max(1, hi - lo)) * 100);
</script>

<div class="flex min-w-0 flex-1 flex-col gap-1 rounded-xs border border-dashed border-surface-700 px-2 py-1.5 {changed ? 'border-accent-500 bg-accent-500/10' : ''}">
	<div class="flex flex-row items-center justify-between gap-2">
		<span class="text-xs text-surface-400">{label}</span>
		<input
			type="number"
			min={lo}
			max={hi}
			class="w-20 rounded-xs bg-transparent text-right text-sm font-semibold text-accent-300 tabular-nums focus:bg-surface-950 focus:outline-none"
			aria-label={label}
			bind:value
		/>
	</div>
	<input
		type="range"
		min={lo}
		max={hi}
		step="1"
		class="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-700 accent-accent-500"
		style:background="linear-gradient(to right, var(--color-accent-500) {fill}%, var(--color-surface-700) {fill}%)"
		aria-label={`${label} slider`}
		bind:value
	/>
	<div class="flex flex-row justify-between text-[10px] text-surface-500 tabular-nums">
		<span>{min.toLocaleString()}</span><span>{max.toLocaleString()}</span>
	</div>
</div>
