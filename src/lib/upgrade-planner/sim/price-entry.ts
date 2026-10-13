/** Keep the item description and price together above the mobile keyboard. */
export function priceEntry(input: HTMLInputElement) {
	const viewport = window.visualViewport;
	const fit = () => {
		if (document.activeElement !== input || !matchMedia('(max-width: 639px)').matches) return;
		const row = input.closest<HTMLElement>('[data-price-row]');
		const scroller = input.closest<HTMLElement>('[data-upgrade-scroller]');
		if (!row || !scroller) return;
		const bounds = scroller.getBoundingClientRect();
		const bar = scroller.querySelector<HTMLElement>('[data-upgrade-nav]');
		const top = bounds.top + (bar?.offsetHeight ?? 0) + 8;
		const bottom = Math.min(bounds.bottom, (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight)) - 8;
		const item = row.getBoundingClientRect();
		if (item.top < top || item.bottom > bottom) scroller.scrollTop += item.top - top;
	};
	let frame = 0;
	const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit); };
	input.addEventListener('focus', schedule);
	viewport?.addEventListener('resize', schedule);
	viewport?.addEventListener('scroll', schedule);
	schedule();
	return { destroy() {
		cancelAnimationFrame(frame);
		input.removeEventListener('focus', schedule);
		viewport?.removeEventListener('resize', schedule);
		viewport?.removeEventListener('scroll', schedule);
	} };
}
