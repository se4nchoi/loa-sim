<!-- An upgrade's name: optional subject line ("Earring 2"), title, and an accessory roll change in roll colors. -->
<script lang="ts">
	import { ROLL_COLORS } from './sim/ui';
	import type { Upgrade } from './upgrades';

	let { u, class: cls = '' }: { u: Upgrade; class?: string } = $props();

	const color = (r: string) => ROLL_COLORS[r as keyof typeof ROLL_COLORS] ?? undefined;
	const label = (r: string) => (r in ROLL_COLORS ? r[0].toUpperCase() + r.slice(1) : r);
</script>

<span class="flex min-w-0 flex-col {cls}">
	{#if u.subject}<span class="text-xs text-surface-400">{u.subject}</span>{/if}
	<span class="text-sm text-surface-100">
		{u.title}{#if u.roll}
			<span class="ml-1 whitespace-nowrap font-semibold">
				<span style:color={color(u.roll.from)}>{label(u.roll.from)}</span>
				<span class="text-surface-400">→</span>
				<span style:color={color(u.roll.to)}>{label(u.roll.to)}</span>
			</span>{/if}{#if u.count > 1}<span class="ml-1 text-xs text-surface-400">×{u.count}</span>{/if}
	</span>
</span>
