// Fold state of sidebar panels (Standing, quick nav), remembered in this browser.

const KEY = 'loa-sim:folded';

function read(): Record<string, boolean> {
	try {
		const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		return v && typeof v === 'object' ? v : {};
	} catch {
		return {};
	}
}

export const folded = $state<Record<string, boolean>>(typeof localStorage === 'undefined' ? {} : read());

export function toggleFold(name: string) {
	folded[name] = !folded[name];
	try {
		localStorage.setItem(KEY, JSON.stringify(folded));
	} catch {
		/* storage blocked: lasts for this visit */
	}
}
