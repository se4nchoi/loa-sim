import { neon } from '@neondatabase/serverless';
import { env } from '$env/dynamic/private';

// The Neon database attached with the STATS prefix now stores usage stats and shared builds.
export const postgresUrl = () => env.STATS_DATABASE_URL || env.STATS_URL;
export const postgresConfigured = () => !!postgresUrl();
export async function postgresQuery(query: string, parameters: unknown[] = [], timeoutMs = 8_000): Promise<Record<string, unknown>[]> {
	const url = postgresUrl();
	if (!url) throw new Error('Postgres storage is not configured.');
	return neon(url).query(query, parameters, {fetchOptions: {signal: AbortSignal.timeout(timeoutMs)}});
}
