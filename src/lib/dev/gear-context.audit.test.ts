// Opt-in: GEAR_CONTEXT_AUDIT=1 npx vitest run src/lib/dev/gear-context.audit.test.ts
// Reads ignored extracts and cached snapshots; never modifies the original LOA Logs database.
import { expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { decodeLoadoutSnapshot } from '$lib/loadout-snapshot';
import { clearState } from '$lib/upgrade-planner/clear-state';
import { gearDamageContext } from '$lib/upgrade-planner/gear-damage-context';
import soulshan from '$lib/upgrade-planner/fixtures/na-soulshan.json';
import type { Loadout } from '$lib/upgrade-planner/types';
import { isParadiseProc } from '$lib/upgrade-planner/dealer-grid-stats';
import { runSummary, type LoggedEntity } from '$lib/logs/run-summary';

type Pair = {damageDoneByStat: number; damageDoneByStatPlusValue: number};
type Row = {id: number; hash: string; passives: unknown; skills: LoggedEntity['skills']; statBuffSources: Record<number, number>; split: Record<string, unknown>};
const marginal = (raw: unknown) => { const p = raw as Pair | undefined; return p && p.damageDoneByStat > 0 ? (p.damageDoneByStatPlusValue / p.damageDoneByStat - 1) * 100 : null; };
const relative = (predicted: number | null | undefined, measured: number | null) => predicted != null && measured ? (predicted / measured - 1) * 100 : null;
const summary = (values: (number | null)[]) => {
	const errors = values.filter((v): v is number => v !== null).map(Math.abs);
	return {compared: errors.length, meanErrorPct: errors.reduce((a,b) => a+b, 0) / errors.length, maxErrorPct: Math.max(...errors)};
};
it.skipIf(!process.env.GEAR_CONTEXT_AUDIT)('compares independent buckets with recorded meter marginals', () => {
	const rows: Row[] = JSON.parse(readFileSync('cache/gear-context-runs.json', 'utf8'));
	const out = rows.map(row => {
		const imported = runSummary({id: row.id, start: 0, boss: '', difficulty: '', cleared: true, player: 'Soulshan', duration: 1},
			{skills: row.skills, arkPassiveData: row.passives, statBuffSources: row.statBuffSources}, {contributionSplits: [{...row.split, name: 'Soulshan'}]}, {})!;
		const evoMeasured = marginal(row.split?.evoDamage1percentDamage);
		const evolution = {predicted: imported.evolutionDamageValue ?? null, measured: evoMeasured, errorPct: relative(imported.evolutionDamageValue, evoMeasured)};
		const file = `cache/context-snapshot-${row.hash.slice(3)}.json`;
		if (!existsSync(file)) return {id: row.id, additional: null, attack: null, evolution};
		const snap = decodeLoadoutSnapshot(JSON.parse(readFileSync(file, 'utf8')));
		const baseline = clearState(soulshan as unknown as Loadout, snap).state;
		const result = gearDamageContext(soulshan as unknown as Loadout, baseline, imported, snap);
		const adMeasured = marginal(row.split?.additionalDamage1percentDamage), total = result.totals.additionalDamage;
		const adPredicted = total === undefined ? null : 100 / (100 + total);
		const ordinary = imported.skills.filter(s => s.damage > 0 && !s.hyper && !isParadiseProc(s.id));
		const apMeasured = marginal(row.split?.attackPower1percentDamage);
		const apPredicted = ordinary.length && ordinary.every(s => result.skills[s.id])
			? ordinary.reduce((sum, s) => sum + s.damage * result.skills[s.id].attackPowerPct * 100, 0) / ordinary.reduce((sum, s) => sum + s.damage, 0) : null;
		return {id: row.id, additional: {total, predicted: adPredicted, measured: adMeasured, errorPct: relative(adPredicted, adMeasured)},
			attack: {predicted: apPredicted, measured: apMeasured, errorPct: relative(apPredicted, apMeasured)}, evolution, missing: result.missing};
	});
	writeFileSync('cache/gear-context-audit.json', JSON.stringify(out, null, 2));
	const report = {runs: out.length, additional: summary(out.map(r => r.additional?.errorPct ?? null)), attack: summary(out.map(r => r.attack?.errorPct ?? null)),
		evolution: summary(out.map(r => r.evolution.errorPct)), evolutionRecovered: out.filter(r => r.evolution.predicted !== null).length,
		evolutionWithoutMeasured: out.filter(r => r.evolution.predicted !== null && r.evolution.measured === null).length};
	expect(report.additional.compared).toBeGreaterThan(0); expect(report.additional.maxErrorPct).toBeLessThan(.3);
	expect(report.attack.compared).toBeGreaterThan(0); expect(report.attack.maxErrorPct).toBeLessThan(.6);
	expect(report.evolution.compared).toBeGreaterThan(0); expect(report.evolution.maxErrorPct).toBeLessThan(.01);
	console.log(JSON.stringify(report, null, 2));
});
