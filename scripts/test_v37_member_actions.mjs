import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
const code=readFileSync(new URL('../src/_worker.js',import.meta.url),'utf8');
const schema=code.match(/const CANONICAL_SCHEMA_SQL=`([\s\S]*?)`;\s*let schemaReadyPromise/)[1];
const worker=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
function norm(v){return v instanceof ArrayBuffer?new Uint8Array(v):v}
class Prepared{constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args}bind(...args){return new Prepared(this.db,this.sql,args.map(norm))}first(){return this.db.prepare(this.sql).get(...this.args)??null}all(){return {results:this.db.prepare(this.sql).all(...this.args)}}run(){const r=this.db.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(r.changes||0),last_row_id:Number(r.lastInsertRowid||0)}}}}
class D1{constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON;')}prepare(sql){return new Prepared(this.db,sql)}exec(sql){this.db.exec(sql);return {count:1}}batch(stmts){this.db.exec('BEGIN');try{const out=stmts.map(x=>x.run());this.db.exec('COMMIT');return out}catch(e){this.db.exec('ROLLBACK');throw e}}}
class KV{constructor(){this.m=new Map()}async get(k){return this.m.has(k)?this.m.get(k):null}async put(k,v){this.m.set(k,String(v))}async delete(k){this.m.delete(k)}}
const env={JOB_DB:new D1(),JOB_KV:new KV(),ASSETS:{fetch:async()=>new Response('asset')},SUPER_ADMIN_EMAIL:'admin@example.test',SUPER_ADMIN_PASSWORD:'AdminPass!123',SUPER_ADMIN_RECOVERY_TOKEN:'Recover!123'};env.JOB_DB.exec(schema);
async function call(path,{method='GET',body,cookie}={}){const h=new Headers();if(cookie)h.set('cookie',cookie);if(body!==undefined)h.set('content-type','application/json');const req=new Request('https://test.local'+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});const res=await worker.fetch(req,env);const txt=await res.text();let data={};try{data=txt?JSON.parse(txt):{}}catch{data={text:txt}}return {status:res.status,data,cookie:res.headers.get('set-cookie')}}
async function ok(path,opts){const r=await call(path,opts);assert.ok(r.status<400,`${opts?.method||'GET'} ${path} ${r.status} ${JSON.stringify(r.data)}`);return r}
await ok('/api/admin-recovery/recover',{method:'POST',body:{email:'admin@example.test',recovery_token:'Recover!123'}});
let r=await ok('/api/login',{method:'POST',body:{email:'admin@example.test',password:'AdminPass!123'}});const admin=r.cookie;
r=await ok('/api/register',{method:'POST',body:{role:'candidate',email:'cand@test.ci',password:'Candidate!123',phone:'0102030405',first_name:'Awa',last_name:'Kouassi',birth_date:'2000-01-01',nationality:'Ivoirienne',city:'Bouaké',country:"Côte d'Ivoire",terms:true}});const cand=r.cookie,candId=r.data.user.id;
r=await ok('/api/register',{method:'POST',body:{role:'recruiter',email:'rec@test.ci',password:'Recruiter!123',phone:'0708091011',first_name:'Jean',last_name:'Konan',job_title:'RH',country:"Côte d'Ivoire",terms:true,privacy:true}});const rec=r.cookie,recId=r.data.user.id;
await ok(`/api/admin/users/${candId}/subscription`,{method:'POST',cookie:admin,body:{plan:'standard',days:30}});await ok(`/api/admin/users/${recId}/subscription`,{method:'POST',cookie:admin,body:{plan:'business',days:365}});
// candidature initiale -> annuler -> retirer -> postuler à nouveau
r=await ok('/api/jobs',{method:'POST',cookie:rec,body:{title:'Comptable',description:'Poste test',employment_type:'CDI',location:'Abidjan'}});const jobId=r.data.id;
await ok(`/api/jobs/${jobId}/apply`,{method:'POST',cookie:cand,body:{message:'Première candidature'}});r=await ok('/api/candidate/applications',{cookie:cand});const appId=r.data.applications[0].id;
await ok(`/api/candidate/applications/${appId}/action`,{method:'POST',cookie:cand,body:{action:'cancel'}});await ok(`/api/candidate/applications/${appId}/action`,{method:'POST',cookie:cand,body:{action:'withdraw'}});
r=await ok(`/api/jobs/${jobId}/apply`,{method:'POST',cookie:cand,body:{message:'Nouvelle candidature après retrait'}});assert.equal(r.data.reapplied,true);r=await ok('/api/recruiter/applications',{cookie:rec});assert.equal(r.data.applications.find(x=>x.id===appId)?.status,'submitted');assert.match(r.data.applications.find(x=>x.id===appId)?.message||'',/Nouvelle candidature/);
// proposition -> candidat masque -> recruteur peut renvoyer -> recruteur peut ensuite masquer sa copie
r=await ok(`/api/candidates/${candId}/recruit`,{method:'POST',cookie:rec,body:{message:'Proposition 1'}});const rrId=r.data.id;
await ok(`/api/candidate/recruitment-requests/${rrId}`,{method:'DELETE',cookie:cand});r=await ok(`/api/candidates/${candId}/recruit`,{method:'POST',cookie:rec,body:{message:'Proposition 2'}});assert.equal(r.data.resent,true);
r=await ok('/api/candidate/recruitment-requests',{cookie:cand});assert.equal(r.data.requests.find(x=>x.id===rrId)?.message,'Proposition 2');
r=await ok('/api/recruiter/recruitment-requests',{cookie:rec});assert.ok(r.data.requests.some(x=>x.id===rrId));await ok(`/api/recruiter/recruitment-requests/${rrId}`,{method:'DELETE',cookie:rec});r=await ok('/api/recruiter/recruitment-requests',{cookie:rec});assert.ok(!r.data.requests.some(x=>x.id===rrId));assert.ok(env.JOB_DB.prepare('SELECT id FROM recruitment_requests WHERE id=?').bind(rrId).first());
// messages envoyés et reçus supprimables localement, admin conserve
await ok('/api/messages',{method:'POST',cookie:rec,body:{receiver_id:candId,content:'Message recruteur'}});await ok('/api/messages',{method:'POST',cookie:cand,body:{receiver_id:recId,content:'Réponse candidat'}});
r=await ok('/api/conversations',{cookie:cand});const conv=r.data.conversations[0].id;r=await ok(`/api/messages?conversation_id=${conv}`,{cookie:cand});const own=r.data.messages.find(x=>Number(x.sender_id)===candId),received=r.data.messages.find(x=>Number(x.sender_id)===recId);assert.ok(own&&received);
await ok(`/api/messages/${own.id}`,{method:'DELETE',cookie:cand});await ok(`/api/messages/${received.id}`,{method:'DELETE',cookie:cand});r=await ok(`/api/messages?conversation_id=${conv}`,{cookie:cand});assert.equal(r.data.messages.length,0);r=await ok('/api/admin/messages',{cookie:admin});assert.ok(r.data.private_messages.some(x=>x.id===own.id)&&r.data.private_messages.some(x=>x.id===received.id));
// conversation masquée localement puis réapparaît lorsqu'un nouveau message arrive
await ok(`/api/conversations/${conv}`,{method:'DELETE',cookie:cand});r=await ok('/api/conversations',{cookie:cand});assert.ok(!r.data.conversations.some(x=>x.id===conv));await ok('/api/messages',{method:'POST',cookie:rec,body:{receiver_id:candId,content:'Nouveau message'}});r=await ok('/api/conversations',{cookie:cand});assert.ok(r.data.conversations.some(x=>x.id===conv));
// notification supprimée localement mais ligne source conservée
r=await ok('/api/notifications',{cookie:cand});const nid=r.data.notifications[0].id;await ok(`/api/notifications/${nid}`,{method:'DELETE',cookie:cand});r=await ok('/api/notifications',{cookie:cand});assert.ok(!r.data.notifications.some(x=>x.id===nid));assert.ok(env.JOB_DB.prepare('SELECT id FROM notifications WHERE id=?').bind(nid).first());
console.log('V37_MEMBER_ACTIONS_OK');
