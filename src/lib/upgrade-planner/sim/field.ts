// Typed number fields on phones: a tap selects the whole value (so typing replaces "0" instead of landing in front of
// it), and the field scrolls into view once the on-screen keyboard is up.
//   <input use:numberField />
//   <dialog use:aboveKeyboard>…</dialog>   (bottom sheets: lift the sheet so the keyboard doesn't cover it)

/** Select all on focus, keep that selection through the tap's mouseup, and keep the field above the keyboard. */
export function numberField(node: HTMLInputElement) {
	let keepSelection = false;
	const focus = () => {
		node.select();
		keepSelection = true;
		revealAboveKeyboard(node);
	};
	// The click that focused the field would otherwise drop the caret where the finger landed.
	const mouseup = (e: MouseEvent) => {
		if (!keepSelection) return;
		keepSelection = false;
		e.preventDefault();
		node.select();
	};
	const blur = () => (keepSelection = false);
	node.addEventListener('focus', focus);
	node.addEventListener('mouseup', mouseup);
	node.addEventListener('blur', blur);
	if (document.activeElement === node) focus();
	return {
		destroy() {
			node.removeEventListener('focus', focus);
			node.removeEventListener('mouseup', mouseup);
			node.removeEventListener('blur', blur);
		}
	};
}

/** Enter moves to the next field in `scope` (keeping the keyboard up while entering a list); on the last it closes. */
export function enterToNext(e: KeyboardEvent, scope: HTMLElement | null | undefined) {
	if (e.key !== 'Enter' || e.isComposing) return;
	e.preventDefault();
	const field = e.currentTarget as HTMLInputElement;
	const fields = [...(scope?.querySelectorAll<HTMLInputElement>('input[data-next]') ?? [])];
	const next = fields[fields.indexOf(field) + 1];
	if (next) next.focus({ preventScroll: true }); // revealAboveKeyboard does the one scroll
	else field.blur();
}

/** Scroll a field to the middle of what the keyboard leaves visible of its list. With the keyboard already up (moving
 *  between fields, which focus with preventScroll), at once: this is the only scroll. Otherwise the keyboard is opening
 *  and iOS pans the screen to the field on its own, so wait until the screen stops moving and correct only what's
 *  still off (scrolling during the pan adds both and overshoots). */
export function revealAboveKeyboard(node: HTMLElement) {
	const vv = window.visualViewport;
	if (!vv || !matchMedia('(pointer: coarse)').matches) return;
	let done = false;
	const reveal = () => {
		if (done) return;
		done = true;
		const scroller = scrollerOf(node);
		// The visible band: the screen above the keyboard, cut to the list's own box when the list is a panel.
		let top = vv.offsetTop, bottom = vv.offsetTop + vv.height;
		if (scroller !== document.scrollingElement) {
			const box = scroller.getBoundingClientRect();
			top = Math.max(top, box.top);
			bottom = Math.min(bottom, box.bottom);
		}
		const r = node.getBoundingClientRect();
		if (r.top < top + 8 || r.bottom > bottom - 8) quickScroll(scroller, r.top + r.height / 2 - (top + bottom) / 2);
	};
	if (window.innerHeight - vv.height > 120) return reveal(); // keyboard already open: no resize will come
	let quiet: ReturnType<typeof setTimeout> | undefined;
	const settle = () => {
		clearTimeout(quiet);
		quiet = setTimeout(finish, 120);
	};
	const finish = () => {
		clearTimeout(quiet);
		clearTimeout(cap);
		vv.removeEventListener('resize', settle);
		vv.removeEventListener('scroll', settle);
		reveal();
	};
	vv.addEventListener('resize', settle);
	vv.addEventListener('scroll', settle);
	quiet = setTimeout(finish, 350); // the keyboard's first resize can take a moment to arrive
	const cap = setTimeout(finish, 800);
}

/** The nearest box that scrolls vertically. (A sideways scroller also reports overflow-y: auto, but its content fits
 *  its height, so the overflow check leaves it out.) */
function scrollerOf(node: HTMLElement): HTMLElement {
	for (let box = node.parentElement; box; box = box.parentElement)
		if (box.scrollHeight > box.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(box).overflowY)) return box;
	return (document.scrollingElement ?? document.documentElement) as HTMLElement;
}

/** Scroll by `dy` px in a short ease-out: the browser's smooth scroll is slow. */
function quickScroll(scroller: HTMLElement, dy: number) {
	const from = scroller.scrollTop;
	const t0 = performance.now();
	const step = (t: number) => {
		const k = Math.min(1, (t - t0) / 160);
		scroller.scrollTop = from + dy * (1 - (1 - k) ** 3);
		if (k < 1) requestAnimationFrame(step);
	};
	requestAnimationFrame(step);
}

/** Bottom-sheet dialogs: sit on top of the on-screen keyboard instead of under it, and shrink to the space left. */
export function aboveKeyboard(node: HTMLElement) {
	const vv = window.visualViewport;
	if (!vv) return;
	const update = () => {
		const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
		node.style.setProperty('--keyboard', `${Math.round(covered)}px`);
		node.style.setProperty('--visible', `${Math.round(vv.height)}px`);
	};
	update();
	vv.addEventListener('resize', update);
	vv.addEventListener('scroll', update);
	return {
		destroy() {
			vv.removeEventListener('resize', update);
			vv.removeEventListener('scroll', update);
		}
	};
}
