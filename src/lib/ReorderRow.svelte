<script lang="ts">
 import type { Snippet } from 'svelte';
 import { dragHandle } from 'svelte-dnd-action';
 let { label, children }: {label: string; children: Snippet} = $props();
</script>
<div class="flex min-w-0 items-start">
 <div use:dragHandle role="button" tabindex="0" aria-label={`Reorder ${label}`} title="Drag to reorder · Space, then arrow keys"
  class="mt-2 flex h-9 w-7 shrink-0 touch-none items-center justify-center rounded-xs text-surface-400 hover:bg-surface-700/40 hover:text-surface-100 focus-visible:outline focus-visible:outline-surface-200">
  <svg viewBox="0 0 12 20" class="h-4 w-3" fill="currentColor" aria-hidden="true"><circle cx="3" cy="4" r="1.3"/><circle cx="9" cy="4" r="1.3"/><circle cx="3" cy="10" r="1.3"/><circle cx="9" cy="10" r="1.3"/><circle cx="3" cy="16" r="1.3"/><circle cx="9" cy="16" r="1.3"/></svg>
 </div>
 <div class="min-w-0 flex-1">{@render children()}</div>
</div>
