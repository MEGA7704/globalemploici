import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

const code=readFileSync(new URL('../src/_worker.js',import.meta.url),'utf8');
const mod=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const worker=mod.default;

function norm(v){ if(v instanceof ArrayBuffer) return new Uint8Array(v); return v; }
class Prepared{
  constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args}
  bind(...args){return new Prepared(this.db,this.sql,args.map(norm))}
  first(){const s=this.db.prepare(this.sql); const row=s.get(...this.args); return row??null}
  all(){const s=this.db.prepare(this.sql); return {results:s.all(...this.args)} }
  run(){const s=this.db.prepare(this.sql); const r=s.run(...this.args); return {success:true,meta:{changes:Number(r.changes||0),last_row_id:Number(r.lastInsertRowid||0)}} }
}
class D1{
  constructor(){this.db=new DatabaseSync(':memory:'); this.db.exec('PRAGMA foreign_keys=ON;')}
  prepare(sql){return new Prepared(this.db,sql)}
  exec(sql){this.db.exec(sql); return {count:1,duration:0}}
  batch(stmts){this.db.exec('BEGIN'); try{const out=stmts.map(s=>s.run()); this.db.exec('COMMIT'); return out}catch(e){this.db.exec('ROLLBACK'); throw e}}
}
class KV{
  constructor(){this.m=new Map()}
  async get(k){return this.m.has(k)?this.m.get(k):null}
  async put(k,v,_opts){this.m.set(k,String(v))}
  async delete(k){this.m.delete(k)}
}
const env={JOB_DB:new D1(),JOB_KV:new KV(),ASSETS:{fetch:async()=>new Response('asset')},SUPER_ADMIN_EMAIL:'admin@example.test',SUPER_ADMIN_PASSWORD:'AdminPass!123',SUPER_ADMIN_RECOVERY_TOKEN:'Recover!123'};

async function call(path,{method='GET',body,cookie,headers={}}={}){
  const h=new Headers(headers); if(cookie) h.set('cookie',cookie); if(body && !(body instanceof FormData)) h.set('content-type','application/json');
  const req=new Request('https://example.test'+path,{method,headers:h,body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
  const res=await worker.fetch(req,env); const txt=await res.text(); let data; try{data=txt?JSON.parse(txt):{}}catch{data={text:txt}}
  if(res.status>=400) console.error('FAIL',method,path,res.status,data);
  return {status:res.status,data,cookie:res.headers.get('set-cookie')};
}
async function ok(path,opts){const r=await call(path,opts); assert.ok(r.status<400,`${opts?.method||'GET'} ${path} -> ${r.status} ${JSON.stringify(r.data)}`); return r}

console.log('1. bootstrap/health');
let r=await ok('/api/health'); assert.equal(r.data.ok,true);

console.log('2. register candidate/recruiter');
r=await ok('/api/register',{method:'POST',body:{role:'candidate',email:'candidate@test.ci',password:'Candidate!123',phone:'0102030405',first_name:'Awa',last_name:'Kouassi',birth_date:'2000-01-01',nationality:'Ivoirienne',city:'Bouaké',country:"Côte d'Ivoire",terms:true}}); const candCookie=r.cookie; const candId=r.data.user.id;
r=await ok('/api/register',{method:'POST',body:{role:'recruiter',email:'recruiter@test.ci',password:'Recruiter!123',phone:'0708091011',first_name:'Jean',last_name:'Konan',job_title:'RH',country:"Côte d'Ivoire",terms:true,privacy:true}}); const recCookie=r.cookie; const recId=r.data.user.id;
assert.ok(candId&&recId);
r=await ok('/api/register',{method:'POST',body:{role:'candidate',email:'candidate2@test.ci',password:'Candidate2!123',phone:'0101010101',first_name:'Mireille',last_name:'Yao',birth_date:'2001-02-02',nationality:'Ivoirienne',city:'Abidjan',country:"Côte d'Ivoire",terms:true}}); const cand2Cookie=r.cookie; const cand2Id=r.data.user.id;
await ok('/api/subscription-request',{method:'POST',cookie:cand2Cookie,body:{plan:'standard',payer_phone:'0101010101',transaction_id:'TX-002'}});

console.log('3. admin login + paid plans');
r=await ok('/api/login',{method:'POST',body:{email:'admin@example.test',password:'AdminPass!123'}}); const adminCookie=r.cookie;
await ok(`/api/admin/users/${recId}/subscription`,{method:'POST',cookie:adminCookie,body:{plan:'business',days:365}});
await ok(`/api/admin/users/${candId}/subscription`,{method:'POST',cookie:adminCookie,body:{plan:'standard',days:30}});

console.log('4. recruiter profile/job/verification/recruitment');
await ok('/api/profile',{method:'POST',cookie:recCookie,body:{first_name:'Jean',last_name:'Konan',job_title:'Responsable RH',company_name:'Entreprise Test',organization_type:'SARL',sector:'Services',main_domain:'Recrutement',description:'Entreprise de test',company_country:"Côte d'Ivoire",company_city:'Abidjan',address:'Cocody',desired_trades:'Comptable, Chauffeur',recruitment_domains:'Services',annual_recruitment_count:'10',contract_types:'CDI, CDD',recruitment_zones:'Abidjan'}});
const fd=new FormData(); fd.append('document_type','rccm'); fd.append('file',new File([new Uint8Array([1,2,3,4])],'rccm.pdf',{type:'application/pdf'})); await ok('/api/recruiter/documents',{method:'POST',cookie:recCookie,body:fd});
await ok('/api/recruiter/verification/submit',{method:'POST',cookie:recCookie,body:{}});
r=await ok('/api/jobs',{method:'POST',cookie:recCookie,body:{title:'Comptable',profession:'Comptable',category:'Finance',description:'Tenue comptable et reporting',employment_type:'CDI',location:'Abidjan',salary:'300000',vacancies:1,status:'published'}}); const jobId=r.data.job?.id||r.data.id;
assert.ok(jobId,'job id');

console.log('5. candidate profile/application');
await ok('/api/profile',{method:'POST',cookie:candCookie,body:{first_name:'Awa',last_name:'Kouassi',city:'Bouaké',country:"Côte d'Ivoire",profession:'Comptable',professional_title:'Comptable',skills:'Excel, comptabilité',description:'Profil de test',availability:'Immédiate',education_items:'[]',experience_items:'[]',language_items:'[]'}});
await ok(`/api/jobs/${jobId}/apply`,{method:'POST',cookie:candCookie,body:{message:'Je suis intéressée'}});
await ok(`/api/candidates/${candId}/recruit`,{method:'POST',cookie:recCookie,body:{message:'Proposition de recrutement'}});
await ok('/api/messages',{method:'POST',cookie:recCookie,body:{receiver_id:candId,content:'Bonjour, votre profil nous intéresse.'}});
await ok('/api/support/messages',{method:'POST',cookie:candCookie,body:{subject:'Test support',content:'Besoin d’aide',category:'support'}});

console.log('6. candidate pages');
for(const p of ['/api/session','/api/dashboard-metrics','/api/profile','/api/profile/completeness','/api/jobs?page=1&per_page=12','/api/candidate/applications','/api/candidate/recruitment-requests','/api/conversations','/api/notifications','/api/subscription-history','/api/support/messages']) await ok(p,{cookie:candCookie});

console.log('7. recruiter pages');
for(const p of ['/api/session','/api/dashboard-metrics','/api/profile','/api/recruiter/jobs','/api/recruiter/applications','/api/candidates?page=1&per_page=12','/api/conversations','/api/notifications','/api/subscription-history','/api/support/messages']) await ok(p,{cookie:recCookie});

console.log('8. admin pages');
const adminPaths=['/api/session','/api/dashboard-metrics','/api/admin/inbox','/api/admin/users','/api/admin/activation-history?status=pending','/api/admin/recruiter-verifications/all','/api/admin/jobs','/api/admin/applications','/api/admin/audit-logs','/api/admin/messages','/api/admin/settings','/api/admin/report?days=30','/api/admin/subscription-requests','/api/admin/recruiter-verifications'];
for(const p of adminPaths) await ok(p,{cookie:adminCookie});

console.log('9. validate non-empty core datasets');
r=await ok('/api/admin/users',{cookie:adminCookie}); assert.ok(r.data.users.length>=4);
r=await ok('/api/admin/jobs',{cookie:adminCookie}); assert.ok(r.data.jobs.length>=1);
r=await ok('/api/admin/applications',{cookie:adminCookie}); assert.ok(r.data.applications.length>=1);
r=await ok('/api/candidate/applications',{cookie:candCookie}); assert.ok(r.data.applications.length>=1);
r=await ok('/api/recruiter/applications',{cookie:recCookie}); assert.ok(r.data.applications.length>=1);
r=await ok('/api/data-linkage',{cookie:adminCookie}); assert.deepEqual(r.data.linkage,{missing_candidate_profiles:0,missing_recruiter_profiles:0,orphan_jobs:0,orphan_applications:0,orphan_recruitment_requests:0});

console.log('V27_INTEGRATION_OK');
