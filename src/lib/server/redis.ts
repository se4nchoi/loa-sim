// Upstash Redis over its REST API (Vercel's KV / Upstash integration env vars), reserved for simulation sharing.
import { env } from '$env/dynamic/private';

export function redisConfig() {
	for (const prefix of ['STORAGE', 'STORAGE_KV', 'STORAGE_UPSTASH_REDIS', 'UPSTASH_REDIS', 'KV']) {
		const url = env[`${prefix}_REST_API_URL`] ?? env[`${prefix}_REST_URL`];
		const token = env[`${prefix}_REST_API_TOKEN`] ?? env[`${prefix}_REST_TOKEN`];
		if (url && token) return { url, token };
	}
	return null;
}

async function post(path: string, body: unknown, fetchFn: typeof fetch, timeoutMs: number): Promise<unknown> {
	const config = redisConfig();
	if (!config) throw new Error('Sharing storage is not configured.');
	const response = await fetchFn(config.url + path, {
		method: 'POST', headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
		body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs), cache: 'no-store'
	});
	if (!response.ok) throw new Error('Sharing storage is unavailable.');
	return response.json();
}

export async function command(args: (string | number)[], fetchFn: typeof fetch, timeoutMs = 10_000): Promise<unknown> {
	const body = (await post('', args, fetchFn, timeoutMs)) as { result?: unknown; error?: unknown };
	if (body.error) throw new Error('Sharing storage could not complete the request.');
	return body.result;
}

/** Several commands in one request; each result in order (one HTTP round trip, still one command each). */
export async function pipeline(commands: (string | number)[][], fetchFn: typeof fetch, timeoutMs = 10_000): Promise<unknown[]> {
	if (!commands.length) return [];
	const body = await post('/pipeline', commands, fetchFn, timeoutMs);
	if (!Array.isArray(body)) throw new Error('Storage returned an unexpected result.');
	return body.map((r: { result?: unknown; error?: unknown }) => {
		if (r?.error) throw new Error('Storage could not complete the request.');
		return r?.result;
	});
}
