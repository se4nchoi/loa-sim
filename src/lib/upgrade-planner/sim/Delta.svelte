<!-- A CP change shown as percent plus raw Combat Power, e.g. "+0.58% +39.40". -->
<script lang="ts">
	import { formatPct } from '../format';

	let { pct, cp, class: cls = '', narrowPctOnly = false }: { pct: number; cp: number; class?: string; /** Phones show the percent only. */ narrowPctOnly?: boolean } = $props();

	const color = $derived(pct > 0.00005 ? 'text-green-400' : pct < -0.00005 ? 'text-red-400' : 'text-surface-300');
	const sign = (n: number) => (n >= 0 ? '+' : '');
</script>

<span class="whitespace-nowrap {color} {cls}">
	{formatPct(pct)}%<span class="ml-1 text-[0.85em] opacity-75 {narrowPctOnly ? 'max-sm:hidden' : ''}">{sign(cp)}{cp.toFixed(2)}</span>
</span>
