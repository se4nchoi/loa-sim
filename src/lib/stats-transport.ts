import type { CountEvent } from './stats-model';

type Pending = { event: CountEvent; attempts: number };
type ClientEvent = Omit<CountEvent, 'id'>;

/** Bounded, memory-only delivery. A timeout after commit reuses IDs instead of inflating counts. */
export function createStatsQueue(send: typeof fetch, uuid = () => crypto.randomUUID()) {
	const pending: Pending[] = [];
	let timer: ReturnType<typeof setTimeout> | undefined;
	let busy = false;
	function schedule(delay = 500) {
		if (!timer && pending.length) timer = setTimeout(() => { timer = undefined; void flush(); }, delay);
	}
	async function flush() {
		if (busy || !pending.length) return;
		if (timer) clearTimeout(timer);
		timer = undefined;
		busy = true;
		const batch: Pending[] = [];
		while(pending.length && batch.length<16){
			const candidate=pending[0];
			const bytes=new TextEncoder().encode(JSON.stringify({events:[...batch.map(p=>p.event),candidate.event]})).byteLength;
			if(bytes>8_192){if(!batch.length){pending.shift();continue;}break;}
			batch.push(pending.shift()!);
		}
		if(!batch.length){busy=false;schedule();return;}
		let retry = false;
		let retryAfter = 0;
		try {
			const response = await send('/api/count', { method: 'POST', headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ events: batch.map(p => p.event) }), keepalive: true, signal: AbortSignal.timeout(5_000) });
			retry = response.status === 429 || response.status >= 500;
			if (response.status === 429) retryAfter = Math.min(300_000, Math.max(60_000, Number(response.headers.get('retry-after') ?? 60) * 1_000 || 60_000));
		} catch { retry = true; }
		if (retry) {
			const again = batch.filter(p => ++p.attempts < 3);
			pending.unshift(...again.slice(0, Math.max(0, 64 - pending.length)));
		}
		busy = false;
		schedule(retry ? Math.max(retryAfter, Math.min(30_000, 1_000 * 2 ** batch[0].attempts)) : 500);
	}
	function enqueue(event: ClientEvent) {
		if (pending.length >= 64) return;
		try { pending.push({ event: { ...event, id: uuid(), v: 2 }, attempts: 0 }); schedule(); }
		catch { /* Analytics must never interrupt the action being observed. */ }
	}
	return { enqueue, flush };
}
