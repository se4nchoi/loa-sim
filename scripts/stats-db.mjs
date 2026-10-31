import {readFile, writeFile} from 'node:fs/promises';
import {neon} from '@neondatabase/serverless';

// Run with node --env-file=<private file> scripts/stats-db.mjs migrate|import|verify.
// Never print connection strings, tokens, or event payloads.
const url=process.env.STATS_DATABASE_URL || process.env.STATS_URL;
if(!url) throw new Error('Set STATS_DATABASE_URL or STATS_URL.');
const sql=neon(url);
const mode=process.argv[2];
export function statements(source) {
 return source.split('-- statement-breakpoint').flatMap(block => /CREATE OR REPLACE FUNCTION/i.test(block)
  ? [block.trim()] : block.split(';').map(s=>s.trim()).filter(s=>/\bCREATE\b/i.test(s)));
}
try {
 if(mode==='migrate') {
  for(const file of ['001-stats-postgres.sql','002-sharing-postgres.sql'])
   for(const query of statements(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'))) await sql.query(query);
  console.log('Stats schema applied.');
 } else if(mode==='verify') {
  const [row]=await sql.query("SELECT current_database() AS database, to_regclass('loa_stats_events') IS NOT NULL AS events, to_regprocedure('loa_stats_ingest(jsonb,text,timestamp with time zone)') IS NOT NULL AS ingest");
  console.log({connected:true, schemaReady:!!row.events && !!row.ingest});
 } else if(mode==='import') {
  const file=process.argv[3]; if(!file) throw new Error('Provide an exported Redis stats file.');
  const data=JSON.parse(await readFile(file,'utf8'));
  if(data.version!==1 || !Array.isArray(data.days) || !Array.isArray(data.ranges)) throw new Error('Invalid stats export.');
  const queries=data.days.map(d=>sql.query('INSERT INTO loa_stats_legacy_days(day,counts,characters) VALUES($1::date,$2::jsonb,$3) ON CONFLICT(day) DO UPDATE SET counts=EXCLUDED.counts,characters=EXCLUDED.characters',[d.date,JSON.stringify(d.counts),d.characters]));
  for(const r of data.ranges) queries.push(sql.query('INSERT INTO loa_stats_legacy_ranges VALUES($1::date,$2::date,$3) ON CONFLICT(first_day,last_day) DO UPDATE SET characters=EXCLUDED.characters',[r.first,r.last,r.characters]));
  if(data.since)queries.push(sql.query("INSERT INTO loa_stats_meta VALUES('exploration-since',$1) ON CONFLICT(key) DO UPDATE SET value=least(loa_stats_meta.value,EXCLUDED.value)",[data.since]));
  await sql.transaction(queries);
  console.log(`Imported ${data.days.length} daily summaries and ${data.ranges.length} character estimates.`);
 } else if(mode==='export-redis') {
  const file=process.argv[3]; if(!file) throw new Error('Provide a private backup filename.');
  const prefix=['STORAGE','STORAGE_KV','STORAGE_UPSTASH_REDIS','UPSTASH_REDIS','KV'].find(p=>(process.env[p+'_REST_API_URL']||process.env[p+'_REST_URL']) && (process.env[p+'_REST_API_TOKEN']||process.env[p+'_REST_TOKEN']));
  if(!prefix)throw new Error('Redis credentials are missing.');
  const endpoint=process.env[prefix+'_REST_API_URL']||process.env[prefix+'_REST_URL'];
  const token=process.env[prefix+'_REST_API_TOKEN']||process.env[prefix+'_REST_TOKEN'];
  const pipeline=async commands=>{
   const res=await fetch(endpoint+'/pipeline',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(commands)});
   if(!res.ok)throw new Error('Redis export request failed.');
   const rows=await res.json();if(rows.some(r=>r.error))throw new Error('Redis export command failed.');return rows.map(r=>r.result);
  };
  const dates=[]; const today=new Date().toISOString().slice(0,10);
  for(let day='2026-10-20';day<=today;day=new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10))dates.push(day);
  // Only known stats keys, never shared builds or browser data. Read-only; originals remain intact.
  if(dates.length>45)throw new Error('Review the export command budget before exporting more than 45 days.');
  const rows=await pipeline(dates.flatMap(d=>[['HGETALL',`loa-sim:stats:${d}`],['PFCOUNT',`loa-sim:stats:characters:${d}`]]));
  const days=dates.map((date,i)=>{const flat=rows[2*i];return {date,counts:Object.fromEntries(Array.from({length:flat.length/2},(_,j)=>[flat[2*j],Number(flat[2*j+1])])),characters:Number(rows[2*i+1])};});
  const ranges=[];const commands=[];
  for(let i=0;i<dates.length;i++)for(let j=i;j<dates.length;j++){ranges.push({first:dates[i],last:dates[j],characters:0});commands.push(['PFCOUNT',...dates.slice(i,j+1).map(d=>`loa-sim:stats:characters:${d}`)]);}
  const counts=[];for(let i=0;i<commands.length;i+=100) counts.push(...await pipeline(commands.slice(i,i+100)));
  ranges.forEach((r,i)=>r.characters=Number(counts[i]));
  const [since]=await pipeline([['GET','loa-sim:stats:exploration-since']]);
  await writeFile(file,JSON.stringify({version:1,exportedAt:new Date().toISOString(),since,days,ranges}));
  console.log(`Exported ${days.length} daily summaries (${commands.length+dates.length*2+1} Redis read commands).`);
 } else throw new Error('Use migrate, verify, export-redis <backup>, or import <backup>.');
} catch {
 console.error('Stats database operation failed. No credentials or data were logged.');
 process.exitCode=1;
}
