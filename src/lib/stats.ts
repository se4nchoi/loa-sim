// Fire-and-forget usage events for /api/count (daily counters; no cookies, nothing stored in the browser).
import { dev } from '$app/environment';

type Event =
	| { event: 'lookup'; region: string; name: string; class?: string }
	| { event: 'lookup_fail'; region: string }
	| { event: 'sim_open' }
	| { event: 'build_saved' };

const sent = new Set<string>();

/** Reports an event; with `once`, only the first event with that key in this tab. */
export function track(e: Event, once?: string) {
	if (dev || typeof fetch === 'undefined') return;
	if (once) {
		if (sent.has(once)) return;
		sent.add(once);
	}
	fetch('/api/count', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(e), keepalive: true })
		.catch(() => {});
}
