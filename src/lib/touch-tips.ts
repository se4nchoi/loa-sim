// Phones have no hover, so `title` tooltips never show. On touch: press and hold anything with a title to see it in a
// bubble; info marks and other non-controls (no tap action of their own) show it on a plain tap too. The bubble closes
// on the next touch or scroll. Installed once from the root layout.

const HOLD_MS = 450;
const CONTROL = 'button, a, input, select, textarea, summary, label, [role="button"], [role="radio"], [tabindex]:not([tabindex="-1"])';

export function installTouchTips(): () => void {
	let tip: HTMLDivElement | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let start = { x: 0, y: 0 };
	/** A hold just showed a tip: the click and context menu that follow its release are swallowed. */
	let swallow = false;

	const hide = () => {
		if (!tip) return;
		try {
			tip.hidePopover?.();
		} catch {
			/* not shown as a popover */
		}
		tip.remove();
		tip = null;
	};

	function show(el: HTMLElement) {
		const text = el.getAttribute('title')?.trim();
		if (!text) return;
		hide();
		tip = document.createElement('div');
		tip.setAttribute('role', 'tooltip');
		tip.textContent = text;
		tip.className = 'touch-tip';
		// A popover sits in the top layer, above modal dialogs; without one, the open dialog holding the element is
		// the only place a fixed bubble can be seen.
		const popover = 'showPopover' in tip;
		if (popover) tip.popover = 'manual';
		(popover ? document.body : el.closest('dialog[open]') ?? document.body).append(tip);
		if (popover) tip.showPopover();
		const r = el.getBoundingClientRect();
		const t = tip.getBoundingClientRect();
		const left = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), window.innerWidth - t.width - 8);
		const above = r.top - t.height - 8;
		tip.style.left = `${left}px`;
		tip.style.top = `${above >= 8 ? above : r.bottom + 8}px`;
	}

	const down = (e: PointerEvent) => {
		hide();
		clearTimeout(timer);
		swallow = false;
		if (e.pointerType !== 'touch') return;
		const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('[title]');
		if (!el) return;
		start = { x: e.clientX, y: e.clientY };
		timer = setTimeout(() => {
			swallow = true;
			show(el);
		}, HOLD_MS);
	};
	const move = (e: PointerEvent) => {
		if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) clearTimeout(timer);
	};
	const up = () => clearTimeout(timer);
	const click = (e: MouseEvent) => {
		if (swallow) {
			swallow = false;
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		// A tap on an info mark (no action of its own) shows its tip.
		if (!matchMedia('(pointer: coarse)').matches) return;
		const target = e.target as HTMLElement | null;
		const el = target?.closest?.<HTMLElement>('[title]');
		if (el && !target!.closest(CONTROL)) show(el);
	};
	const menu = (e: Event) => {
		if (swallow || tip) e.preventDefault();
	};

	document.addEventListener('pointerdown', down, true);
	document.addEventListener('pointermove', move, true);
	document.addEventListener('pointerup', up, true);
	document.addEventListener('pointercancel', up, true);
	document.addEventListener('click', click, true);
	document.addEventListener('contextmenu', menu, true);
	window.addEventListener('scroll', hide, true);
	return () => {
		hide();
		document.removeEventListener('pointerdown', down, true);
		document.removeEventListener('pointermove', move, true);
		document.removeEventListener('pointerup', up, true);
		document.removeEventListener('pointercancel', up, true);
		document.removeEventListener('click', click, true);
		document.removeEventListener('contextmenu', menu, true);
		window.removeEventListener('scroll', hide, true);
	};
}
