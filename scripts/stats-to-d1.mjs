import {writeFile} from 'node:fs/promises';
import {neon} from '@neondatabase/serverless';

// One-off copy of the stats history from Neon into D1, run after the D1 code is deployed:
//   node --env-file=<private env file> scripts/stats-to-d1.mjs <private out.sql>
//   npx wrangler d1 execute STATS_DB --remote --file <private out.sql>
// It only reads Neon. The SQL adds to whatever D1 has recorded since the deploy, so nothing is lost or
// counted twice; a second run is refused by the 'neon-import' marker. Keep the file outside Git.
// Never print connection strings or event payloads.
const url=process.env.STATS_DATABASE_URL || process.env.STATS_URL;
const file=process.argv[2];
try {
 if(!url) throw new Error('Set STATS_DATABASE_URL or STATS_URL.');
 if(!file) throw new Error('Provide an output .sql filename.');
 const sql=neon(url);
 const q=v=>v===null||v===undefined?'NULL':typeof v==='number'?String(v):`'${String(v).replace(/'/g,"''")}'`;
 const day="to_char(day,'YYYY-MM-DD') AS day";
 const [events,counters,characters,meta,legacyDays,legacyRanges]=await sql.transaction([
  sql.query(`SELECT id, occurred_at, ${day}, character_hash, fields, sample, sampling, version, exploration FROM loa_stats_events`),
  sql.query(`SELECT ${day}, field, value::text AS value FROM loa_stats_counters`),
  sql.query(`SELECT ${day}, character_hash FROM loa_stats_characters`),
  sql.query(`SELECT value FROM loa_stats_meta WHERE key='exploration-since'`),
  sql.query(`SELECT ${day}, counts, characters::text AS characters FROM loa_stats_legacy_days`),
  sql.query(`SELECT to_char(first_day,'YYYY-MM-DD') AS first, to_char(last_day,'YYYY-MM-DD') AS last, characters::text AS characters FROM loa_stats_legacy_ranges`),
 ],{readOnly:true});
 const lines=[
  // Fails on a second run before anything else is written.
  `INSERT INTO loa_stats_meta(key,value) VALUES('neon-import',${q(new Date().toISOString())});`,
  ...events.map(e=>`INSERT INTO loa_stats_events(id,occurred_at,day,character_hash,fields,sample,sampling,version,exploration,imported) VALUES(${[
   e.id,new Date(e.occurred_at).toISOString(),e.day,e.character_hash,JSON.stringify(e.fields),
   e.sample===null?null:JSON.stringify(e.sample),e.sampling===null?null:JSON.stringify(e.sampling)].map(q).join(',')},${Number(e.version)},${e.exploration?1:0},1) ON CONFLICT(id) DO NOTHING;`),
  ...counters.map(c=>`INSERT INTO loa_stats_counters(day,field,value) VALUES(${q(c.day)},${q(c.field)},${Number(c.value)}) ON CONFLICT(day,field) DO UPDATE SET value=value+excluded.value;`),
  ...characters.map(c=>`INSERT OR IGNORE INTO loa_stats_characters(day,character_hash) VALUES(${q(c.day)},${q(c.character_hash)});`),
  ...meta.map(m=>`INSERT INTO loa_stats_meta(key,value) VALUES('exploration-since',${q(m.value)}) ON CONFLICT(key) DO UPDATE SET value=min(value,excluded.value);`),
  ...legacyDays.map(d=>`INSERT INTO loa_stats_legacy_days(day,counts,characters) VALUES(${q(d.day)},${q(JSON.stringify(d.counts))},${Number(d.characters)}) ON CONFLICT(day) DO UPDATE SET counts=excluded.counts,characters=excluded.characters;`),
  ...legacyRanges.map(r=>`INSERT INTO loa_stats_legacy_ranges(first_day,last_day,characters) VALUES(${q(r.first)},${q(r.last)},${Number(r.characters)}) ON CONFLICT(first_day,last_day) DO UPDATE SET characters=excluded.characters;`),
 ];
 await writeFile(file,lines.join('\n')+'\n');
 console.log(`Wrote ${events.length} events, ${counters.length} counters, ${characters.length} character-days, ${legacyDays.length} legacy days and ${legacyRanges.length} legacy ranges.`);
} catch(e) {
 console.error(e instanceof Error && e.message.startsWith('Set ')||e instanceof Error && e.message.startsWith('Provide ')?e.message:'Stats export failed. No credentials or data were logged.');
 process.exitCode=1;
}
