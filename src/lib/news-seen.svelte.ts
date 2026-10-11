// Which updates are new to this browser. Read once per page load and shared, so the desktop side card and the
// phone strip agree; the newest date is saved straight away, so the dots show for this visit only.
import { UPDATES } from './site-news';

const SEEN_KEY = 'loa-sim:news-seen';

/** Newest update date seen before this visit: null until read, '' on a first visit (nothing is marked new). */
export const newsSeen = $state<{ before: string | null }>({ before: null });

export function readNewsSeen() {
	if (newsSeen.before !== null) return;
	try {
		newsSeen.before = localStorage.getItem(SEEN_KEY) ?? '';
		localStorage.setItem(SEEN_KEY, UPDATES[0]?.date ?? '');
	} catch {
		newsSeen.before = '';
	}
}

export const isFresh = (date: string) => !!newsSeen.before && date > newsSeen.before;
