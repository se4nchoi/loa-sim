import { CP_STATS_MODEL, isCpStatsModel, type CpStatsModel } from './stats-versions';

export const SAMPLE_KINDS = ['opportunity', 'decision', 'budget', 'plan'] as const;
export const SKIP_REASONS = ['no-context', 'baseline-mismatch', 'over-willpower', 'unknown-class',
	'unknown-region', 'invalid-item-level', 'missing-item-level', 'invalid-values', 'unsettled',
	'no-positive-gain', 'no-priced-candidate', 'unmounted', 'observation-error'] as const;
export type SkipReason = typeof SKIP_REASONS[number];
export type SamplingAttempt = { kind: typeof SAMPLE_KINDS[number]; model: CpStatsModel; reason?: SkipReason };
export const samplingAttempt = (kind: SamplingAttempt['kind'], reason?: SkipReason): SamplingAttempt =>
	({ kind, model: CP_STATS_MODEL, ...(reason ? { reason } : {}) });

/** Only bounded diagnostics are accepted; no exception messages or user content. */
export function cleanSampling(value: unknown): SamplingAttempt | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return;
	const s = value as Record<string, unknown>;
	if (Object.keys(s).some(k => !['kind', 'model', 'reason'].includes(k)) ||
		!(SAMPLE_KINDS as readonly unknown[]).includes(s.kind) || !isCpStatsModel(s.model) ||
		(s.reason !== undefined && !(SKIP_REASONS as readonly unknown[]).includes(s.reason))) return;
	return { kind: s.kind as SamplingAttempt['kind'], model: s.model,
		...(s.reason ? { reason: s.reason as SkipReason } : {}) };
}

export function samplingFields(s: SamplingAttempt): string[] {
	return [`sampling:attempt:${s.model}:${s.kind}`, `sampling:outcome:${s.model}:${s.kind}:${s.reason ?? 'sampled'}`];
}
