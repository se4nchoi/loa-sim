// Bump when CP/price model semantics change; keep historical IDs in the ingestion allowlist when migrating.
// The first tag spans the Vambraces correction on Oct 26; its history cannot be unmixed.
export const CP_STATS_MODELS = ['cp-2026-10-25', 'cp-2026-10-26-vambraces-v1'] as const;
export type CpStatsModel = typeof CP_STATS_MODELS[number];
export const CP_STATS_MODEL = CP_STATS_MODELS[1];
export const STATS_SCHEMA = 3 as const;
export const isCpStatsModel = (value: unknown): value is CpStatsModel =>
	typeof value === 'string' && (CP_STATS_MODELS as readonly string[]).includes(value);
