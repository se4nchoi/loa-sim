// Builds a small LOA Logs–shaped encounters.db for testing the importer:
//   node scripts/make-test-logs-db.mjs [out=cache/test-encounters.db]
// Schema follows snoww/loa-logs (encounter, encounter_preview, entity with gzipped skills JSON).

import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';

const out = process.argv[2] ?? 'cache/test-encounters.db';
fs.mkdirSync('cache', { recursive: true });
for (const f of [out, `${out}-wal`, `${out}-shm`]) fs.rmSync(f, { force: true });

const db = new DatabaseSync(out);
db.exec(`
	PRAGMA journal_mode = WAL;
	CREATE TABLE encounter (id INTEGER PRIMARY KEY, last_combat_packet INTEGER, total_damage_dealt INTEGER, version INTEGER NOT NULL DEFAULT 5);
	CREATE TABLE encounter_preview (
		id INTEGER PRIMARY KEY, fight_start INTEGER, current_boss TEXT, duration INTEGER, players TEXT, difficulty TEXT,
		local_player TEXT, my_dps INTEGER, favorite BOOLEAN NOT NULL DEFAULT 0, cleared BOOLEAN, boss_only_damage BOOLEAN NOT NULL DEFAULT 0
	);
	CREATE TABLE entity (
		name TEXT, character_id INTEGER, encounter_id INTEGER NOT NULL, npc_id INTEGER, entity_type TEXT, class_id INTEGER, class TEXT,
		gear_score REAL, current_hp INTEGER, max_hp INTEGER, is_dead INTEGER, skills BLOB, damage_stats TEXT, dps INTEGER,
		skill_stats TEXT, last_update INTEGER, engravings TEXT, PRIMARY KEY (name, encounter_id)
	);
`);

const now = Date.now();
const day = 24 * 3600 * 1000;
const skill = (id, name, icon, total_damage) => [id, { id, name, icon, total_damage, casts: 10 }];
// Shares per run (Soulshan): Reaper's Scythe 30/20/40, Astaros 20/30/20, Death Yard 2/2/2, rest = other.
const runs = [
	{ id: 1, start: now - 1 * 3600 * 1000, player: 'Soulshan', boss: 'Archdemon Kazeros', cleared: 1, dmg: [30, 20, 2, 48] },
	{ id: 2, start: now - 2 * 3600 * 1000, player: 'Soulshan', boss: 'Archdemon Kazeros', cleared: 1, dmg: [20, 30, 2, 48] },
	{ id: 3, start: now - 9 * day, player: 'Soulshan', boss: 'Brelshaza, Ember in the Ashes', cleared: 1, dmg: [40, 20, 2, 38] },
	{ id: 5, start: now - 9 * day - 3600 * 1000, player: 'Soulshan', boss: 'Armoche, Sentinel of the Abyss', cleared: 1, dmg: [35, 25, 2, 38] },
	{ id: 4, start: now - 3 * 3600 * 1000, player: 'SomeAlt', boss: 'Archdemon Kazeros', cleared: 1, dmg: [90, 5, 5, 0] }
];
const insE = db.prepare('INSERT INTO encounter (id, last_combat_packet, total_damage_dealt) VALUES (?, ?, ?)');
const insP = db.prepare(
	'INSERT INTO encounter_preview (id, fight_start, current_boss, duration, players, difficulty, local_player, my_dps, cleared) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
const insN = db.prepare('INSERT INTO entity (name, encounter_id, entity_type, class, skills) VALUES (?, ?, ?, ?, ?)');
for (const r of runs) {
	const [a, b, c, d] = r.dmg.map((pct) => pct * 1_000_000);
	const skills = Object.fromEntries([
		skill(46500, "Reaper's Scythe", 'SE_Skill_01_16.png', a),
		skill(46430, 'Astaros', 'SE_Skill_01_13.png', b),
		skill(46450, 'Death Yard', 'SE_Skill_01_15.png', c),
		skill(46200, 'Harvest', 'SE_Skill_01_01.png', d)
	]);
	insE.run(r.id, r.start + 600_000, a + b + c + d);
	insP.run(r.id, r.start, r.boss, 600_000, `405:${r.player}`, 'Normal', r.player, 1_000_000, r.cleared);
	insN.run(r.player, r.id, 'PLAYER', 'Souleater', gzipSync(Buffer.from(JSON.stringify(skills))));
}
db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
db.close();
console.log(`wrote ${out} (${fs.statSync(out).size} bytes)`);
