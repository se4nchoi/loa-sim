import { neon } from '@neondatabase/serverless';
import { env } from '$env/dynamic/private';

// Explicit stats prefix prevents accidentally using another database attached to this project.
export const statsDatabaseUrl = () => env.STATS_DATABASE_URL || env.STATS_URL;
export const statsConfigured = () => !!statsDatabaseUrl();
export async function statsQuery(query: string, parameters: unknown[] = [], timeoutMs = 8_000): Promise<Record<string, unknown>[]> {
	const url = statsDatabaseUrl();
	if (!url) throw new Error('Stats storage is not configured.');
	return neon(url).query(query, parameters, {fetchOptions: {signal: AbortSignal.timeout(timeoutMs)}});
}
