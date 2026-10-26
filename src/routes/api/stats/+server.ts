// Private usage stats as JSON for the /stats page: /api/stats?days=30 (or days=all), with
// `authorization: Bearer <STATS_KEY>`. Header only, so the key never lands in URLs or logs. Off unless STATS_KEY is set.
import { env } from '$env/dynamic/private';
import { redisConfig } from '$lib/server/redis';
import { MAX_STATS_DAYS, readStats } from '$lib/server/stats';
import { error, json } from '@sveltejs/kit';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from './$types';

const digest = (s: string) => createHash('sha256').update(s).digest();

export const GET: RequestHandler = async ({ request, url, fetch }) => {
	const expected = env.STATS_KEY;
	const given = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
	if (!expected || !timingSafeEqual(digest(given), digest(expected))) error(404, 'Not found');
	if (!redisConfig()) error(503, 'Storage is not configured.');
	const param = url.searchParams.get('days') ?? '30';
	const days = param === 'all' ? MAX_STATS_DAYS : Number(param);
	if (!Number.isInteger(days) || days < 1 || days > MAX_STATS_DAYS) error(400, 'Invalid date range');
	try {
		return json(await readStats(days, fetch), { headers: { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' } });
	} catch {
		error(503, 'Could not read stats.');
	}
};
