// Places a dropdown menu (a `popover="manual"` element) under its parent (the picker), or above it when there's more
// room there. Top-layer menus use viewport coordinates, so they stay on screen even inside transformed dialogs and
// on narrow phones.
//
// Size is set here, not left to the browser: the popover UA style sizes the box with `fit-content`, which WebKit
// (every iPhone browser) resolves to the whole max-height instead of the content, so menus ballooned and their grid
// rows stretched to fill. The width is max-content clamped to the screen, and the height is the content's own
// height (measured with rows packed to the top) clamped to the room, both as plain pixels.

import { tick } from 'svelte';

export function placeMenu(node: HTMLElement, options: 'left' | 'right' | { align: 'left' | 'right'; fit: boolean } = 'left') {
	const align = typeof options === 'string' ? options : options.align;
	const fit = typeof options !== 'string' && options.fit;
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
		node.style.alignContent = 'start';
		node.style.width = fit ? `${Math.min(at.width, window.innerWidth - margin * 2)}px` : 'max-content';
		node.style.maxWidth = `${window.innerWidth - margin * 2}px`;
		node.style.minWidth = `${Math.min(at.width, window.innerWidth - margin * 2)}px`;
		// Natural height: let it size to content, then read it back (scrollHeight excludes the border).
		node.style.height = 'auto';
		node.style.maxHeight = 'none';
		const cs = getComputedStyle(node);
		const natural = node.scrollHeight + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
		const box = node.getBoundingClientRect();
		const left = align === 'right' ? at.right - box.width : at.left;
		node.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - box.width - margin))}px`;
		const below = window.innerHeight - at.bottom - margin - 4;
		const above = at.top - margin - 4;
		const flip = below < Math.min(natural, 200) && above > below;
		if (limit === Infinity) limit = Math.min(cssMax, flip ? above : below);
		const room = Math.max(0, Math.min(limit, flip ? above : below));
		const height = Math.min(natural, room);
		node.style.maxHeight = `${room}px`;
		node.style.height = `${height}px`;
		node.style.top = `${flip ? Math.max(margin, at.top - height - 4) : at.bottom + 4}px`;
		node.style.marginTop = '0';
	};
	// Scrolling the menu's own list doesn't move its anchor.
	const onScroll = (e: Event) => (e.target instanceof Node && node.contains(e.target)) || place();
	void tick().then(place);
	// A kept snapshot/plan can be deleted while the menu remains open.
	const contents = new MutationObserver(place);
	contents.observe(node, { childList: true, subtree: true, characterData: true });
	window.addEventListener('resize', place);
	window.addEventListener('scroll', onScroll, true);
	return {
		destroy() {
			contents.disconnect();
			window.removeEventListener('resize', place);
			window.removeEventListener('scroll', onScroll, true);
		}
	};
}
