// Opt-in: STACK_AUDIT=cache/dps-live-latest.db npx vitest run src/lib/dev/stack-replay.audit.test.ts
// Replays the Order core stack rules on every player in a local copy of the LOA Logs database (party members too), and
// prints each spending skill's damage by stacks. Read-only; use a copy, never the live database.
import { it } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { appendFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { BUFF_WINDOWS, buffIdsNamed, replayStacks, replayWindow, STACK_RULES, type ReplaySkillLog } from '$lib/logs/stack-replay';

const decode = (v: unknown) => {
	if (v === null || v === undefined) return {};
	if (typeof v === 'string') return JSON.parse(v);
	const b = Buffer.from(v as Uint8Array);
	return JSON.parse((b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b) : b).toString());
};

it.skipIf(!process.env.STACK_AUDIT)('replays stack rules on local runs', () => {
	const out = process.env.STACK_AUDIT_OUT ?? 'cache/stack-audit.txt';
	writeFileSync(out, '');
	const log = (...a: unknown[]) => appendFileSync(out, a.join(' ') + '\n');
	const db = new DatabaseSync(process.env.STACK_AUDIT!, { readOnly: true });
	const rows = db.prepare(`SELECT e.encounter_id, e.name, e.class, e.skills, c.buffs FROM entity e JOIN encounter c ON c.id = e.encounter_id WHERE e.entity_type = 'PLAYER'`).all() as Record<string, unknown>[];
	const totals = new Map<string, { runs: number; byStacks: Record<string, number> }>();
	for (const row of rows) {
		const skills = Object.entries(decode(row.skills) as Record<string, { id?: number; name?: string; skillCastLog?: ReplaySkillLog['casts'] }>)
			.map(([key, s]) => ({ id: Number(s.id ?? key), name: s.name ?? '', casts: s.skillCastLog ?? [] }));
		if (!skills.some((s) => s.casts.length)) continue;
		const buffs = decode(row.buffs) as Record<string, { source?: { name?: string } }>;
		const names = new Map(Object.entries(buffs).map(([id, b]) => [Number(id), b.source?.name ?? '']));
		for (const w of BUFF_WINDOWS) {
			const done = replayWindow(w.buffs, skills, names);
			if (!done) continue;
			const key = `${w.cls}:${w.core}`;
			const t = totals.get(key) ?? { runs: 0, byStacks: {} };
			t.runs++;
			for (const bySkill of Object.values(done)) for (const [k, d] of Object.entries(bySkill)) t.byStacks[k] = (t.byStacks[k] ?? 0) + d;
			totals.set(key, t);
		}
		for (const rule of STACK_RULES) {
			if (!skills.some((s) => rule.on.skills?.includes(s.name))) continue;
			const window = rule.while ? buffIdsNamed(names, rule.while).size : -1;
			const done = replayStacks(rule, skills, names);
			const key = `${rule.cls}:${rule.core}`;
			log(`${row.encounter_id} ${row.class} ${key} window=${window} ${done ? JSON.stringify(done) : 'unresolved'}`);
			if (!done) continue;
			const t = totals.get(key) ?? { runs: 0, byStacks: {} };
			t.runs++;
			for (const bySkill of Object.values(done)) for (const [k, d] of Object.entries(bySkill)) t.byStacks[k] = (t.byStacks[k] ?? 0) + d;
			totals.set(key, t);
		}
	}
	for (const [key, t] of totals) {
		const all = Object.values(t.byStacks).reduce((a, b) => a + b, 0);
		log(key, t.runs, 'runs', Object.entries(t.byStacks).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, d]) => `${k}:${(d / all * 100).toFixed(1)}%`).join(' '));
	}
}, 600_000);
