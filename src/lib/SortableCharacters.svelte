<script lang="ts" generics="T extends {region: string; name: string}">
	import { onMount, type Snippet } from 'svelte';
	import { flip } from 'svelte/animate';
	import { dragHandleZone, SHADOW_ITEM_MARKER_PROPERTY_NAME, type DndEvent } from 'svelte-dnd-action';
	import { characterKey } from './saved-character';
	let { characters, group, onorder, children }: {characters: T[]; group: string; onorder: (ids: string[]) => void; children: Snippet<[T]>} = $props();
	type Row = {id: string; character: T; isDndShadowItem?: boolean};
	let items = $state<Row[]>([]);
	let sorting = $state(false);
 let reducedMotion = $state(false);
 const duration = $derived(reducedMotion ? 0 : 100);
 onMount(() => {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const update = () => reducedMotion = media.matches;
  update(); media.addEventListener('change', update);
  return () => media.removeEventListener('change', update);
 });
	$effect(() => {
		const source = characters;
		if (!sorting) items = source.map(character => ({id: characterKey(character), character}));
	});
	function consider(e: CustomEvent<DndEvent<Row>>) {
		sorting = true;
		items = e.detail.items;
	}
	function finalize(e: CustomEvent<DndEvent<Row>>) {
		items = e.detail.items;
		onorder(items.filter(item => !item[SHADOW_ITEM_MARKER_PROPERTY_NAME]).map(item => item.id));
		sorting = false;
	}
	function lifted(element?: HTMLElement) {
		if (!element) return;
		element.style.boxShadow = '0 12px 32px #0009';
		element.style.background = 'var(--color-surface-800)';
		element.style.borderRadius = '3px';
		element.style.outline = '1px solid var(--color-surface-500)';
	}
</script>

<div use:dragHandleZone={{items, type: group, flipDurationMs: duration, dropFromOthersDisabled: true, useCursorForDetection: true, dropTargetStyle: {}, delayTouchStart: true, transformDraggedElement: lifted}}
	onconsider={consider} onfinalize={finalize} aria-label={`${group === 'roster' ? 'Roster' : 'Characters'} order`}>
	{#each items as item (item.id)}
		<div animate:flip={{duration}} data-reorder-id={item.id} data-reorder-group={group} aria-label={item.character.name}
			class="sort-row min-w-0 border-b border-neutral-950 last:border-b-0 {item[SHADOW_ITEM_MARKER_PROPERTY_NAME] ? 'sort-placeholder' : ''}">
			{@render children(item.character)}
		</div>
	{/each}
</div>

<style>
	.sort-placeholder { visibility: visible !important; background: #ffffff08; outline: 1px dashed #ffffff40 !important; outline-offset: -2px; }
	.sort-placeholder :global(> *) { opacity: 0; }
</style>
