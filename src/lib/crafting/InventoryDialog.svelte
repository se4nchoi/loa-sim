<script lang="ts">
	import { onMount } from 'svelte';
	import type { CraftMarket } from './storage';
	import Inventory from './Inventory.svelte';
	import ModalClose from '$lib/upgrade-planner/sim/ModalClose.svelte';
	import DrawerHandle from '$lib/upgrade-planner/sim/DrawerHandle.svelte';
	import { sheetDialog, sheetDrag } from '$lib/upgrade-planner/sim/sheet-drag';
	import { aboveKeyboard } from '$lib/upgrade-planner/sim/field';

	let { market = $bindable(), onclose }: { market: CraftMarket; onclose: () => void } = $props();
	let dialog: HTMLDialogElement;
	let card = $state<HTMLDivElement>();
	onMount(() => {
		dialog.showModal();
		dialog.focus();
	});
</script>

<dialog
	id="material-inventory"
	bind:this={dialog} use:sheetDialog={() => card} use:aboveKeyboard
	tabindex="-1" {onclose}
	onclick={event => event.target === dialog && dialog.close()}
	aria-labelledby="crafting-inventory-title"
	class="fixed top-[80px] m-0 max-h-none max-w-none bg-transparent p-0 text-surface-100 outline-none backdrop:bg-black/60 max-sm:top-auto max-sm:bottom-[var(--keyboard,0px)] max-sm:left-0 max-sm:w-full sm:left-1/2 sm:-translate-x-1/2"
>
	<div bind:this={card} class="sim-modal-card flex w-[620px] max-w-[calc(100vw-2rem)] flex-col rounded-xs bg-surface-900 shadow-sm shadow-neutral-800 max-sm:w-full max-sm:max-w-full max-sm:rounded-t-xl max-sm:rounded-b-none max-sm:animate-[sheet-up_320ms_cubic-bezier(0.22,1,0.36,1)] sm:rounded-sm sm:shadow-xl sm:shadow-black/40 sm:ring-1 sm:ring-surface-700">
		<DrawerHandle sheet={() => card} close={() => dialog.close()} label="inventory sheet" />
		<div class="sim-modal-header flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 font-bold sm:py-3 sm:text-base sm:font-semibold" use:sheetDrag={{ sheet: () => card, close: () => dialog.close(), enabled: () => matchMedia('(max-width: 639px)').matches }}>
			<h2 id="crafting-inventory-title">Crafting material inventory</h2>
			<ModalClose close={() => dialog.close()} label="Close material inventory" />
		</div>
		<div class="min-h-0 max-h-[70vh] overflow-y-auto px-4 pt-3 pb-4 max-sm:max-h-[min(70vh,calc(var(--visible,100vh)-4.5rem))]">
			<Inventory bind:market />
		</div>
	</div>
</dialog>
