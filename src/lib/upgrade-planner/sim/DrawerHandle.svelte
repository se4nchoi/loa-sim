<script lang="ts">
 import { sheetDrag } from './sheet-drag';
 let {sheet,close,label,visibility='sm:hidden',phone='(max-width: 639px)'}:{sheet:()=>HTMLElement|undefined;close:()=>void;label:string;visibility?:string;phone?:string}=$props();
</script>
<button type="button" class="flex shrink-0 flex-col items-center px-4 pt-3 pb-2 {visibility}" aria-label={`Close ${label}`} use:sheetDrag={{sheet,close,enabled:()=>matchMedia(phone).matches}} onclick={close}>
 <span class="h-1.5 w-12 rounded-full bg-surface-500"></span>
</button>
