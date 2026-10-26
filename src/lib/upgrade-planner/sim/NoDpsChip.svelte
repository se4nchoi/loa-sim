<!-- An edit the DPS meter won't count, at the control that makes it; it opens the DPS sim's explanation of why. -->
<script lang="ts">
	import { showDpsLimit, type DpsLimitKey } from '../dps-limit-link.svelte';

	let { limit, label = 'no DPS', title }: { limit: DpsLimitKey; label?: string; title: string } = $props();
</script>

<button type="button" class="shrink-0 rounded-xs border border-amber-500/40 bg-amber-500/5 px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-amber-300 transition hover:bg-amber-500/15 hover:text-amber-200" {title} onclick={() => showDpsLimit(limit)}>{label} ↗</button>
