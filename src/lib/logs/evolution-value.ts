import { EVOLUTION_CAPS } from './evolution-caps';

/** LOA Logs' efficiency pair stores actual and maximum BONUS damage, not whole damage with/without a passive.
 * Max bonus contribution = sum(damage * cap / (100 + evolution)). Dividing by cap recovers the +1 pp marginal.
 * This does not recover the crit-rate distribution or allow a changed conversion rule. */
export function evolutionValue(split: unknown, nodes: {id: number; lv: number}[] | undefined, ordinaryDamage: number): number | undefined {
	if (!split || typeof split !== 'object' || !nodes || !(ordinaryDamage > 0) || !Number.isFinite(ordinaryDamage)) return undefined;
	const raw = split as Record<string, unknown>;
	if (typeof raw.damageDoneWithoutUltimateAwakening !== 'number' || !Number.isFinite(raw.damageDoneWithoutUltimateAwakening) || Math.abs(raw.damageDoneWithoutUltimateAwakening - ordinaryDamage) > 1) return undefined;
	const values: number[] = [];
	for (const node of nodes) {
		const definition = EVOLUTION_CAPS[node.id];
		if (!definition) continue;
		const cap = definition.caps[node.lv - 1];
		const pair = raw[definition.metric] as {damageDoneByStat?: unknown; damageDoneByStatPlusValue?: unknown} | undefined;
		const actual = pair?.damageDoneByStat, maximum = pair?.damageDoneByStatPlusValue;
		if (!(cap > 0) || typeof actual !== 'number' || typeof maximum !== 'number' || !Number.isFinite(actual) || !Number.isFinite(maximum) || actual < 0 || maximum <= 0 || actual > maximum + 1) return undefined;
		const value = maximum / cap / ordinaryDamage * 100;
		if (!Number.isFinite(value) || value <= 0 || value > 1) return undefined;
		values.push(value);
	}
	if (!values.length || Math.max(...values) - Math.min(...values) > .0001) return undefined;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}
