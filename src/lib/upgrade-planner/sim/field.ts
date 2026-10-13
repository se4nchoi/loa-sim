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
	if (next) next.focus();
	else field.blur();
}

/** Scroll a field to the middle of what the keyboard leaves visible, once the keyboard has opened. */
export function revealAboveKeyboard(node: HTMLElement) {
	const vv = window.visualViewport;
	if (!vv || !matchMedia('(pointer: coarse)').matches) return;
	let done = false;
	const reveal = () => {
		if (done) return;
		done = true;
		vv.removeEventListener('resize', reveal);
		const r = node.getBoundingClientRect();
		if (r.top < vv.offsetTop + 8 || r.bottom > vv.offsetTop + vv.height - 8) node.scrollIntoView({ block: 'center', behavior: 'smooth' });
	};
	vv.addEventListener('resize', reveal);
	setTimeout(reveal, 400); // keyboard already open (moving between fields): no resize comes
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
