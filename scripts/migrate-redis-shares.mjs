import {createServer} from 'vite';
import {neon} from '@neondatabase/serverless';
import {inflateSync} from 'node:zlib';
import {writeFile} from 'node:fs/promises';

// One-time, read-only Redis export followed by verified inserts. Keep the backup outside Git.
const backup=process.argv[2];
if(!backup)throw new Error('Provide a private backup filename.');
const url=process.env.STATS_DATABASE_URL||process.env.STATS_URL;
const prefix=['STORAGE','STORAGE_KV','STORAGE_UPSTASH_REDIS','UPSTASH_REDIS','KV'].find(p=>(process.env[p+'_REST_API_URL']||process.env[p+'_REST_URL'])&&(process.env[p+'_REST_API_TOKEN']||process.env[p+'_REST_TOKEN']));
if(!url||!prefix)throw new Error('Postgres and legacy Redis credentials are required.');
const endpoint=process.env[prefix+'_REST_API_URL']||process.env[prefix+'_REST_URL'];
const token=process.env[prefix+'_REST_API_TOKEN']||process.env[prefix+'_REST_TOKEN'];
const sql=neon(url);
let server;
async function redis(commands){
 const response=await fetch(endpoint+'/pipeline',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(commands),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Redis read failed.');
 const rows=await response.json();
 if(!Array.isArray(rows)||rows.length!==commands.length)throw new Error('Invalid Redis response.');
 if(rows.some(r=>r.error)){
  if(rows.some(r=>/max requests limit exceeded/i.test(String(r.error))))throw new Error('Redis quota is still exhausted; no migration was completed.');
  throw new Error('Redis rejected a migration read.');
 }
 return rows.map(r=>r.result);
}
try{
 const keys=new Set();let cursor='0',pages=0;
 do{
  const [page]=await redis([['SCAN',cursor,'MATCH','loa-sim:share:*','COUNT',1000]]);
  if(!Array.isArray(page)||!Array.isArray(page[1]))throw new Error('Invalid Redis scan.');
  cursor=String(page[0]);page[1].forEach(k=>{if(/^loa-sim:share:[A-Za-z0-9_-]{8}$/.test(k))keys.add(k);});
  if(++pages>10000||keys.size>100000)throw new Error('Migration safety limit reached.');
 }while(cursor!=='0');
 const entries=[];const list=[...keys];
 for(let i=0;i<list.length;i+=50){
  const batch=list.slice(i,i+50),values=await redis(batch.map(k=>['GET',k]));
  batch.forEach((key,j)=>{if(values[j]!==null)entries.push({id:key.split(':').at(-1),payload:values[j]});});
 }
 await writeFile(backup,JSON.stringify({version:1,exportedAt:new Date().toISOString(),entries}),{flag:'wx'});
 server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
 const {parseSimulation}=await server.ssrLoadModule('/src/lib/upgrade-planner/saved-simulations.ts');
 const active=[];let expired=0;
 for(const row of entries){
  if(typeof row.payload!=='string'||row.payload.length>351000)throw new Error('Invalid legacy payload; backup retained.');
  const entry=JSON.parse(inflateSync(Buffer.from(row.payload,'base64url'),{maxOutputLength:262144}).toString());
  if(!entry||entry.version!==1||!Number.isFinite(entry.expiresAt)||!Number.isFinite(entry.originalCp))throw new Error('Invalid legacy entry; backup retained.');
  if(entry.expiresAt<=Date.now()){expired++;continue;}
  const plan=parseSimulation(JSON.stringify(entry.plan));
  if(!/^(na|ce)\/[^/?#\s]{1,40}$/u.test(plan.characterKey.toLowerCase()))throw new Error('Invalid legacy character; backup retained.');
  active.push({...row,character:plan.characterKey.split('/')[1].toLowerCase(),expiry:new Date(entry.expiresAt).toISOString()});
 }
 // Bound request sizes; partial copies are immutable and safe to resume.
 for(let i=0;i<active.length;i+=16)await sql.transaction(active.slice(i,i+16).map(r=>sql.query('INSERT INTO loa_shared_simulations(id,character,payload,expires_at) VALUES($1,$2,$3,$4::timestamptz) ON CONFLICT(id) DO NOTHING',[r.id,r.character,r.payload,r.expiry])));
 for(let i=0;i<active.length;i+=50){
  const batch=active.slice(i,i+50);
  const stored=await sql.query('SELECT id,payload,expires_at FROM loa_shared_simulations WHERE id=ANY($1::text[])',[batch.map(r=>r.id)]);
  for(const source of batch){const target=stored.find(r=>r.id===source.id);if(!target||target.payload!==source.payload||new Date(target.expires_at).getTime()!==Date.parse(source.expiry))throw new Error('Migration verification failed; originals and backup retained.');}
 }
 // Only a fully verified copy can disable the runtime's Redis recovery reads.
 await sql.query("INSERT INTO loa_stats_meta(key,value) VALUES('redis-shares-imported',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[new Date().toISOString()]);
 console.log({scannedKeys:keys.size,copiedAndVerified:active.length,expiredSkipped:expired,redisModified:false,backupSaved:true});
}catch(error){
 const safe=['Redis quota is still exhausted; no migration was completed.','Migration verification failed; originals and backup retained.','Invalid legacy payload; backup retained.','Invalid legacy entry; backup retained.','Invalid legacy character; backup retained.'];
 console.error(safe.includes(error.message)?error.message:'Migration failed safely. Originals retained; credentials and payloads were not logged.');process.exitCode=1;
}finally{await server?.close();}
