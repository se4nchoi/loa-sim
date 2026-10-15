<script lang="ts">
 let {close,label='Close'}:{close:()=>void;label?:string}=$props();
</script>
<button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-xs text-surface-300 transition hover:bg-surface-800 hover:text-surface-50 focus-visible:outline-2 focus-visible:outline-accent-400" aria-label={label} title="Close" onclick={close}>
 <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
</button>
