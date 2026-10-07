<!-- Row of toggle buttons; the selected one fills with its color (e.g. High / Mid / Low in roll colors). -->
<script lang="ts" generics="T extends string | number">
	let {
		value,
		options,
		onselect,
		label,
		disabled = false,
		size = 'h-8 min-w-11 px-2 text-sm'
	}: {
		value: T | null;
		options: { value: T; label: string; color?: string; title?: string }[];
		onselect: (v: T) => void;
		label: string;
		disabled?: boolean;
		size?: string;
	} = $props();
</script>

<div class="inline-flex overflow-hidden rounded-xs border border-surface-700 bg-surface-950" role="radiogroup" aria-label={label}>
	{#each options as o, i (o.value)}
		{@const selected = o.value === value}
		<button
			type="button"
			role="radio"
			aria-checked={selected}
			title={o.title}
			{disabled}
			class="{size} font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 {i > 0 ? 'border-l border-surface-800' : ''} {selected
				? 'text-white'
				: 'text-surface-400 hover:bg-surface-800 hover:text-surface-100'}"
			style:background-color={selected ? (o.color ?? 'var(--color-accent-700)') : undefined}
			onclick={() => onselect(o.value)}
		>
			{o.label}
		</button>
	{/each}
</div>
