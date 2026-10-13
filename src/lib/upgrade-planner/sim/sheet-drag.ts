// Drag-to-close for bottom sheets on phones: a pull on the zone moves the sheet with the finger; past a third of its
// height or a quick flick down it closes, otherwise it springs back. Pointer downs on controls (buttons, inputs,
// links, radios) are left alone, and a drag never also counts as a click.
//   <div use:sheetDrag={{ sheet: () => el, close }}>…</div>

export interface SheetDragOptions {
	/** The element that moves (the sheet). */
	sheet: () => HTMLElement | undefined;
	close: () => void;
	/** Only drag when this says so (e.g. phones only). */
	enabled?: () => boolean;
}

const SPRING = 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)';
const isControl = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('button, input, select, textarea, a, [role="radio"]');

export function sheetDrag(node: HTMLElement, options: SheetDragOptions) {
	let opts = options;
	let start = { y: 0, t: 0 };
	let active = false;
	let moved = false;
	let dy = 0;

	const down = (e: PointerEvent) => {
		if ((opts.enabled && !opts.enabled()) || (isControl(e.target) && !node.matches('button'))) return;
		active = true;
		moved = false;
		dy = 0;
		start = { y: e.clientY, t: performance.now() };
		try {
			node.setPointerCapture(e.pointerId);
		} catch {
			/* synthetic pointer */
		}
	};
	const move = (e: PointerEvent) => {
		const sheet = opts.sheet();
		if (!active || !sheet) return;
		dy = e.clientY - start.y;
		if (Math.abs(dy) > 4) moved = true;
		sheet.style.transition = 'none';
		// Down only: pulling up would lift the sheet's bottom edge off the screen and show the page beneath.
		sheet.style.transform = `translateY(${Math.max(0, dy)}px)`;
	};
	const up = () => {
		const sheet = opts.sheet();
		if (!active || !sheet) return;
		active = false;
		const speed = dy / Math.max(1, performance.now() - start.t); // px per ms
		// Closing leaves the sheet where the finger let go: the sheet's own out-animation (sheetDialog, the drawer's
		// transition) slides it down from there.
		if (moved && (dy > sheet.offsetHeight / 3 || speed > 0.6)) opts.close();
		else {
			sheet.style.transition = SPRING;
			sheet.style.transform = '';
		}
	};
	// A drag that ends over a control must not also click it.
	const click = (e: MouseEvent) => {
		if (!moved) return;
		moved = false;
		e.preventDefault();
		e.stopPropagation();
	};

	node.style.touchAction = 'none';
	node.addEventListener('pointerdown', down);
	node.addEventListener('pointermove', move);
	node.addEventListener('pointerup', up);
	node.addEventListener('pointercancel', up);
	node.addEventListener('click', click, true);
	return {
		update(next: SheetDragOptions) {
			opts = next;
		},
		destroy() {
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointermove', move);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', up);
			node.removeEventListener('click', click, true);
		}
	};
}

const PHONE = '(max-width: 639px)';

/**
 * Bottom-sheet dialogs on phones: every close (Close button, backdrop tap, Escape, a drag) slides the sheet down
 * from wherever it is and fades the backdrop before the dialog really closes. Larger screens close at once.
 *   <dialog use:sheetDialog={() => card}>…</dialog>
 */
export function sheetDialog(dialog: HTMLDialogElement, sheet: () => HTMLElement | undefined) {
	let getSheet = sheet;
	let closing = false;
	const nativeClose = HTMLDialogElement.prototype.close;
	dialog.close = function (returnValue?: string) {
		const el = getSheet();
		if (closing) return;
		if (!el || !dialog.open || !matchMedia(PHONE).matches || matchMedia('(prefers-reduced-motion: reduce)').matches)
			return nativeClose.call(dialog, returnValue);
		closing = true;
		const transform = getComputedStyle(el).transform;
		const from = transform && transform !== 'none' ? new DOMMatrix(transform).m42 : 0;
		const slide = el.animate([{ transform: `translateY(${from}px)` }, { transform: 'translateY(100%)' }], {
			duration: 220,
			easing: 'cubic-bezier(0.4, 0, 1, 1)',
			fill: 'forwards'
		});
		try {
			dialog.animate({ opacity: [1, 0] }, { duration: 220, fill: 'forwards', pseudoElement: '::backdrop' });
		} catch {
			/* no ::backdrop animations: it just goes with the dialog */
		}
		const done = () => {
			nativeClose.call(dialog, returnValue);
			// Drop the slide and fade (not the sheet's CSS open animation), so a reopened dialog starts clean.
			for (const a of dialog.getAnimations({ subtree: true })) if (!(a instanceof CSSAnimation)) a.cancel();
			el.style.transform = '';
			el.style.transition = '';
			closing = false;
		};
		slide.finished.then(done, done);
	};
	// Escape goes through the same slide.
	const cancel = (e: Event) => {
		if (!matchMedia(PHONE).matches) return;
		e.preventDefault();
		dialog.close();
	};
	dialog.addEventListener('cancel', cancel);
	return {
		update(next: () => HTMLElement | undefined) {
			getSheet = next;
		},
		destroy() {
			dialog.removeEventListener('cancel', cancel);
			delete (dialog as { close?: unknown }).close;
		}
	};
}
