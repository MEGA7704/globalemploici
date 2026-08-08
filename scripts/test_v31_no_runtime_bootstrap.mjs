import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

const code=readFileSync(new URL('../src/_worker.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
function norm(v){return v instanceof ArrayBuffer?new Uint8Array(v):v}
class P{constructor(d,sql,args=[]){this.d=d;this.sql=sql;this.args=args}bind(...a){return new P(this.d,this.sql,a.map(norm))}first(){return this.d.db.prepare(this.sql).get(...this.args)||null}all(){return {results:this.d.db.prepare(this.sql).all(...this.args)}}run(){const r=this.d.db.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(r.changes||0),last_row_id:Number(r.lastInsertRowid||0)}}}}
class D1{
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON');this.forbidExec=false;this.execCalls=0}
  prepare(s){return new P(this,s)}
  exec(s){this.execCalls++;if(this.forbidExec)throw new Error('RUNTIME_D1_EXEC_FORBIDDEN: '+String(s).slice(0,80));this.db.exec(s);return {count:1}}
  batch(ss){this.db.exec('BEGIN');try{const out=ss.map(s=>s.run());this.db.exec('COMMIT');return out}catch(e){this.db.exec('ROLLBACK');throw e}}
}
class KV{constructor(){this.m=new Map()}async get(k){return this.m.get(k)??null}async put(k,v){this.m.set(k,String(v))}async delete(k){this.m.delete(k)}}

const d1=new D1();
const migDir=new URL('../legacy_migrations_v26/',import.meta.url);
for(const f of readdirSync(migDir).filter(x=>x.endsWith('.sql')).sort()) d1.db.exec(readFileSync(new URL(f,migDir),'utf8'));
for(const [n,t] of Object.entries({education_required:'TEXT',experience_required:'TEXT',skills_required:'TEXT',responsibilities:'TEXT',candidate_profile:'TEXT',work_schedule:'TEXT',availability_required:'TEXT',view_count:'INTEGER DEFAULT 0'})){
  const have=new Set(d1.db.prepare('PRAGMA table_info(jobs)').all().map(x=>x.name));
  if(!have.has(n)) d1.db.exec(`ALTER TABLE jobs ADD COLUMN ${n} ${t}`);
}
const env={JOB_DB:d1,JOB_KV:new KV(),ASSETS:{fetch:async()=>new Response('asset')},SUPER_ADMIN_EMAIL:'admin@example.test',SUPER_ADMIN_PASSWORD:'AdminPass!123'};
async function call(path,{method='GET',body,cookie}={}){const h=new Headers();if(cookie)h.set('cookie',cookie);if(body)h.set('content-type','application/json');const t0=performance.now();const r=await worker.fetch(new Request('https://x.test'+path,{method,headers:h,body:body?JSON.stringify(body):undefined}),env);const ms=performance.now()-t0;const txt=await r.text();let data={};try{data=txt?JSON.parse(txt):{}}catch{data={text:txt}};assert.ok(r.status<400,`${method} ${path}: ${r.status} ${txt}`);return {r,data,cookie:r.headers.get('set-cookie'),ms}}

let x=await call('/api/register',{method:'POST',body:{role:'candidate',email:'candidate@v31.test',password:'Candidate!123',phone:'01',first_name:'Awa',last_name:'Kouassi',birth_date:'2000-01-01',nationality:'Ivoirienne',city:'Bouaké',country:"Côte d'Ivoire",terms:true}});const cc=x.cookie, cid=x.data.user.id;
x=await call('/api/register',{method:'POST',body:{role:'recruiter',email:'recruiter@v31.test',password:'Recruiter!123',phone:'07',first_name:'Jean',last_name:'Konan',job_title:'RH',country:"Côte d'Ivoire",terms:true,privacy:true}});const rc=x.cookie, rid=x.data.user.id;
x=await call('/api/login',{method:'POST',body:{email:'admin@example.test',password:'AdminPass!123'}});const ac=x.cookie;
await call(`/api/admin/users/${rid}/subscription`,{method:'POST',cookie:ac,body:{plan:'business',days:365}});
await call(`/api/admin/users/${cid}/subscription`,{method:'POST',cookie:ac,body:{plan:'standard',days:30}});
x=await call('/api/jobs',{method:'POST',cookie:rc,body:{title:'Comptable',description:'Test',status:'published',location:'Abidjan'}});const jid=x.data.id;
await call(`/api/jobs/${jid}/apply`,{method:'POST',cookie:cc,body:{message:'Test'}});

// À partir d'ici, toute commande D1.exec (CREATE/ALTER/archive/import runtime) est interdite.
d1.forbidExec=true;
const groups={
  candidate:['/api/session','/api/dashboard-metrics','/api/profile','/api/profile/completeness','/api/jobs?page=1&per_page=12','/api/candidate/applications','/api/candidate/recruitment-requests','/api/conversations','/api/notifications','/api/subscription-history','/api/support/messages'],
  recruiter:['/api/session','/api/dashboard-metrics','/api/profile','/api/recruiter/jobs','/api/recruiter/applications','/api/candidates?page=1&per_page=12','/api/conversations','/api/notifications','/api/subscription-history','/api/support/messages'],
  admin:['/api/session','/api/dashboard-metrics','/api/admin/inbox','/api/admin/users','/api/admin/activation-history?status=pending','/api/admin/recruiter-verifications/all','/api/admin/jobs','/api/admin/applications','/api/admin/audit-logs','/api/admin/messages','/api/admin/settings','/api/admin/report?days=30','/api/admin/subscription-requests','/api/admin/recruiter-verifications']
};
const cookies={candidate:cc,recruiter:rc,admin:ac};
let max=0;let count=0;
for(const [role,paths] of Object.entries(groups)) for(const p of paths){const y=await call(p,{cookie:cookies[role]});max=Math.max(max,y.ms);count++;assert.ok(y.ms<1500,`${role} ${p} too slow: ${y.ms.toFixed(1)}ms`)}
assert.equal(d1.execCalls,0,'A runtime D1.exec command was executed by a menu route');
console.log(`V31_NO_RUNTIME_BOOTSTRAP_OK routes=${count} max_ms=${max.toFixed(1)}`);
