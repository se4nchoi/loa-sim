// Drag-to-close for bottom sheets on phones: a pull on the zone moves the sheet with the finger; past a third of its
// height or a quick flick down it closes, otherwise it springs back. Pointer downs on controls (buttons, inputs,
// links, radios) are left alone, and a drag never also counts as a click.
//   <div use:sheetDrag={{ sheet: () => el, close }}>…</div>

export interface SheetDragOptions {
	/** The element that moves (the sheet). */
	sheet: () => HTMLElement | undefined;
	close: () => void;
	/** Slide the sheet out before calling close (dialogs); a component with its own out-transition skips it. */
	slideOut?: boolean;
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
		if (moved && (dy > sheet.offsetHeight / 3 || speed > 0.6)) {
			if (opts.slideOut) {
				sheet.style.transition = 'transform 200ms ease-in';
				sheet.style.transform = 'translateY(100%)';
				setTimeout(() => {
					opts.close();
					sheet.style.transform = '';
					sheet.style.transition = '';
				}, 200);
			} else opts.close();
		} else {
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
