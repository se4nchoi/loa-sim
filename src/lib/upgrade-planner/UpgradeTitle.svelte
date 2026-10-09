<!-- An upgrade's name: optional subject line ("Earring 2"), title, and an accessory roll change in roll colors. -->
<script lang="ts">
	import { ROLL_COLORS } from './sim/ui';
	import type { Upgrade } from './upgrades';

	let { u, compact = false, class: cls = '' }: { u: Upgrade; /** Whole accessories as just their rolls (High-High-Mid). */ compact?: boolean; class?: string } = $props();

	const color = (r: string) => ROLL_COLORS[r as keyof typeof ROLL_COLORS] ?? undefined;
	const label = (r: string) => (r in ROLL_COLORS ? r[0].toUpperCase() + r.slice(1) : r);
</script>

<span class="flex min-w-0 flex-col {cls}">
	{#if u.subject}<span class="text-xs text-surface-400">{u.subject}</span>{/if}
	{#if u.lines && compact}
		<!-- A whole accessory, short: its rolls in order, in the roll colors (X = no third line). -->
		<span class="text-sm font-semibold" title={u.lines.map((line) => `${line.name} ${label(line.tier)}`).join(' · ')}>
			{#each [...u.lines, ...(u.lines.length < 3 ? [null] : [])] as line, i (i)}{#if i}<span class="text-surface-500">-</span>{/if}{#if line}<span style:color={color(line.tier)}>{label(line.tier)}</span>{:else}<span class="text-surface-500">X</span>{/if}{/each}
		</span>
	{:else if u.lines}
		<!-- A whole accessory: each line with its roll, in the roll colors. -->
		<span class="flex flex-col text-sm leading-snug text-surface-100">
			{#each u.lines as line (line.name)}
				<span>{line.name} <b style:color={color(line.tier)} class="font-semibold">{label(line.tier)}</b></span>
			{/each}
			{#if u.lines.length < 3}<span class="text-surface-500">None</span>{/if}
		</span>
	{:else}
	<span class="text-sm text-surface-100">
		{u.title}{#if u.roll}
			<span class="ml-1 whitespace-nowrap font-semibold">
				<span style:color={color(u.roll.from)}>{label(u.roll.from)}</span>
				<span class="text-surface-400">→</span>
				<span style:color={color(u.roll.to)}>{label(u.roll.to)}</span>
			</span>{/if}{#if u.count > 1}<span class="ml-1 text-xs text-surface-400" title={`You have ${u.count} of these; the gain shown is for one`}>×{u.count}</span>{/if}
	</span>
	{/if}
</span>
