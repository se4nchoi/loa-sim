// Places a dropdown menu (a `popover="manual"` element) under its parent (the picker), or above it when there's more
// room there. Top-layer menus use viewport coordinates, so they stay on screen even inside transformed dialogs and
// on narrow phones.

import { tick } from 'svelte';

export function placeMenu(node: HTMLElement, align: 'left' | 'right' = 'left') {
	const anchor = node.parentElement!;
	// The class max-height (if any), read before inline styles override it.
	const cssMax = parseFloat(getComputedStyle(node).maxHeight) || Infinity;
	// Height is fixed at open: phone browsers grow innerHeight as their toolbar hides on scroll.
	let limit = Infinity;
	const place = () => {
		if (!node.isConnected) return;
		const margin = 8;
		const at = anchor.getBoundingClientRect();
		node.style.position = 'fixed';
		node.style.inset = 'auto';
		node.style.margin = '0';
		if (!node.matches(':popover-open')) node.showPopover();
		node.style.right = 'auto';
		node.style.maxWidth = `${window.innerWidth - margin * 2}px`;
		node.style.minWidth = `${Math.min(at.width, window.innerWidth - margin * 2)}px`;
		const box = node.getBoundingClientRect();
		const left = align === 'right' ? at.right - box.width : at.left;
		node.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - box.width - margin))}px`;
		const below = window.innerHeight - at.bottom - margin - 4;
		const above = at.top - margin - 4;
		const flip = below < Math.min(box.height, 200) && above > below;
		if (limit === Infinity) limit = Math.min(cssMax, flip ? above : below);
		const room = Math.max(0, Math.min(limit, flip ? above : below));
		node.style.maxHeight = `${room}px`;
		node.style.top = `${flip ? Math.max(margin, at.top - Math.min(box.height, room) - 4) : at.bottom + 4}px`;
		node.style.marginTop = '0';
	};
	// Scrolling the menu's own list doesn't move its anchor.
	const onScroll = (e: Event) => (e.target instanceof Node && node.contains(e.target)) || place();
	void tick().then(place);
	window.addEventListener('resize', place);
	window.addEventListener('scroll', onScroll, true);
	return {
		destroy() {
			window.removeEventListener('resize', place);
			window.removeEventListener('scroll', onScroll, true);
		}
	};
}
