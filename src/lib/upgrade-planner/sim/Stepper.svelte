<!-- − value + control; big enough to tap, keyboard-editable value in the middle. -->
<script lang="ts">
	let {
		value = $bindable(),
		min,
		max,
		step = 1,
		prefix = '',
		suffix = '',
		changed = false,
		label,
		width = 'w-12',
		buttonsOnly = false,
		normalize
	}: {
		value: number;
		min: number;
		max: number;
		step?: number;
		prefix?: string;
		suffix?: string;
		changed?: boolean;
		label: string;
		width?: string;
		/** Just − and + everywhere, for values shown elsewhere and never typed (e.g. gem levels 1–10). */
		buttonsOnly?: boolean;
		/** Optional normalization for typed values; also commits when an invalid step loses focus. */
		normalize?: (value: number) => number;
	} = $props();

	const clamp = (v: number) => Math.min(max, Math.max(min, v));
	function commit(input: HTMLInputElement) {
		const next = clamp(Number(input.value) || min);
		value = normalize ? clamp(normalize(next)) : next;
		input.value = String(value);
	}
	const btn =
		'flex size-8 shrink-0 items-center justify-center text-lg leading-none text-surface-200 transition hover:bg-surface-700 disabled:opacity-30 disabled:hover:bg-transparent';
</script>

<div
	class="inline-flex h-8 shrink-0 items-stretch overflow-hidden rounded-xs border bg-surface-950 {changed ? 'border-accent-500 bg-accent-500/10' : 'border-surface-700'}"
	role="group"
	aria-label={label}
>
	<button type="button" class={btn} aria-label={`${label}: decrease`} disabled={value <= min} onclick={() => (value = clamp(value - step))}>−</button>
	<label
		class="flex cursor-text items-center justify-center border-x border-surface-700 bg-surface-800/80 px-1.5 {buttonsOnly ? 'hidden' : ''} text-sm font-semibold tabular-nums transition hover:bg-surface-700/80 focus-within:bg-surface-700 focus-within:ring-1 focus-within:ring-accent-500 focus-within:ring-inset"
		title="Click to type a value"
	>
		{#if prefix}<span class="text-surface-300">{prefix}</span>{/if}
		<input
			type="number"
			{min}
			{max}
			{step}
			class="{width} bg-transparent {prefix ? 'text-left' : 'text-center'} [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
			aria-label={label}
			{value}
			onchange={(e) => commit(e.currentTarget)}
			onblur={normalize ? (e) => commit(e.currentTarget) : undefined}
		/>
		<span class="text-surface-400">{suffix}</span>
	</label>
	<button type="button" class="{btn} {buttonsOnly ? 'border-l border-surface-700' : ''}" aria-label={`${label}: increase`} disabled={value >= max} onclick={() => (value = clamp(value + step))}>+</button>
</div>
