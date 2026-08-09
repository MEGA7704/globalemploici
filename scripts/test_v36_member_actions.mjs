import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

const code=readFileSync(new URL('../src/_worker.js',import.meta.url),'utf8');
const schemaMatch=code.match(/const CANONICAL_SCHEMA_SQL=`([\s\S]*?)`;\s*let schemaReadyPromise/);
assert.ok(schemaMatch,'canonical schema found');
const canonicalSchema=schemaMatch[1];
const mod=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const worker=mod.default;
function norm(v){return v instanceof ArrayBuffer?new Uint8Array(v):v}
class Prepared{constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args}bind(...args){return new Prepared(this.db,this.sql,args.map(norm))}first(){return this.db.prepare(this.sql).get(...this.args)??null}all(){return {results:this.db.prepare(this.sql).all(...this.args)}}run(){const r=this.db.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(r.changes||0),last_row_id:Number(r.lastInsertRowid||0)}}}}
class D1{constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON;')}prepare(sql){return new Prepared(this.db,sql)}exec(sql){this.db.exec(sql);return {count:1}}batch(stmts){this.db.exec('BEGIN');try{const out=stmts.map(x=>x.run());this.db.exec('COMMIT');return out}catch(e){this.db.exec('ROLLBACK');throw e}}}
class KV{constructor(){this.m=new Map()}async get(k){return this.m.has(k)?this.m.get(k):null}async put(k,v){this.m.set(k,String(v))}async delete(k){this.m.delete(k)}}
const env={JOB_DB:new D1(),JOB_KV:new KV(),ASSETS:{fetch:async()=>new Response('asset')},SUPER_ADMIN_EMAIL:'admin@example.test',SUPER_ADMIN_PASSWORD:'AdminPass!123',SUPER_ADMIN_RECOVERY_TOKEN:'Recover!123'};
env.JOB_DB.exec(canonicalSchema);
async function call(path,{method='GET',body,cookie}={}){const h=new Headers();if(cookie)h.set('cookie',cookie);if(body!==undefined)h.set('content-type','application/json');const req=new Request('https://test.local'+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});const res=await worker.fetch(req,env);const txt=await res.text();let data={};try{data=txt?JSON.parse(txt):{}}catch{data={text:txt}}return {status:res.status,data,cookie:res.headers.get('set-cookie')}}
async function ok(path,opts){const r=await call(path,opts);assert.ok(r.status<400,`${opts?.method||'GET'} ${path} ${r.status} ${JSON.stringify(r.data)}`);return r}

await ok('/api/admin-recovery/recover',{method:'POST',body:{email:'admin@example.test',recovery_token:'Recover!123'}});
let r=await ok('/api/login',{method:'POST',body:{email:'admin@example.test',password:'AdminPass!123'}});const adminCookie=r.cookie;
r=await ok('/api/register',{method:'POST',body:{role:'candidate',email:'candidate@test.ci',password:'Candidate!123',phone:'0102030405',first_name:'Awa',last_name:'Kouassi',birth_date:'2000-01-01',nationality:'Ivoirienne',city:'Bouaké',country:"Côte d'Ivoire",terms:true}});const candCookie=r.cookie,candId=r.data.user.id;
r=await ok('/api/register',{method:'POST',body:{role:'recruiter',email:'recruiter@test.ci',password:'Recruiter!123',phone:'0708091011',first_name:'Jean',last_name:'Konan',job_title:'RH',country:"Côte d'Ivoire",terms:true,privacy:true}});const recCookie=r.cookie,recId=r.data.user.id;
await ok(`/api/admin/users/${candId}/subscription`,{method:'POST',cookie:adminCookie,body:{plan:'standard',days:30}});
await ok(`/api/admin/users/${recId}/subscription`,{method:'POST',cookie:adminCookie,body:{plan:'business',days:365}});

// Un accès payant actif ne peut pas redemander une activation.
r=await call('/api/subscription-request',{method:'POST',cookie:candCookie,body:{plan:'business',payer_phone:'0102030405',transaction_id:'TX-ACTIVE'}});assert.equal(r.status,409);assert.match(r.data.error,/déjà un abonnement payant actif/i);

// Crée offre, candidature, proposition et message reçu.
r=await ok('/api/jobs',{method:'POST',cookie:recCookie,body:{title:'Comptable',description:'Poste test',employment_type:'CDI',location:'Abidjan'}});const jobId=r.data.id;
await ok(`/api/jobs/${jobId}/apply`,{method:'POST',cookie:candCookie,body:{message:'Candidature test'}});
await ok(`/api/candidates/${candId}/recruit`,{method:'POST',cookie:recCookie,body:{message:'Proposition test'}});
await ok('/api/messages',{method:'POST',cookie:recCookie,body:{receiver_id:candId,content:'Message reçu à masquer'}});

// Notification lue reste lue.
r=await ok('/api/notifications',{cookie:candCookie});assert.ok(r.data.notifications.length>=2);const notifId=r.data.notifications[0].id;
await ok(`/api/notifications/${notifId}/read`,{method:'POST',cookie:candCookie,body:{}});
r=await ok('/api/notifications',{cookie:candCookie});assert.equal(Number(r.data.notifications.find(x=>x.id===notifId).is_read),1);
r=await ok('/api/notifications',{cookie:candCookie});assert.equal(Number(r.data.notifications.find(x=>x.id===notifId).is_read),1);
// Suppression notification client seulement.
await ok(`/api/notifications/${notifId}`,{method:'DELETE',cookie:candCookie});
r=await ok('/api/notifications',{cookie:candCookie});assert.ok(!r.data.notifications.some(x=>x.id===notifId));

// Proposition masquée côté candidat mais conservée en base/Admin.
r=await ok('/api/candidate/recruitment-requests',{cookie:candCookie});const rrId=r.data.requests[0].id;
await ok(`/api/candidate/recruitment-requests/${rrId}`,{method:'DELETE',cookie:candCookie});
r=await ok('/api/candidate/recruitment-requests',{cookie:candCookie});assert.ok(!r.data.requests.some(x=>x.id===rrId));
assert.ok(env.JOB_DB.prepare('SELECT id FROM recruitment_requests WHERE id=?').bind(rrId).first(),'proposal retained in DB');
r=await ok('/api/admin/inbox',{cookie:adminCookie});assert.ok(r.data.recruitment_requests.some(x=>x.id===rrId),'proposal retained for admin');

// Message reçu masqué côté candidat mais conservé côté admin/DB.
r=await ok('/api/conversations',{cookie:candCookie});const convId=r.data.conversations[0].id;
r=await ok(`/api/messages?conversation_id=${convId}`,{cookie:candCookie});const recv=r.data.messages.find(x=>Number(x.sender_id)===Number(recId));assert.ok(recv);
await ok(`/api/messages/${recv.id}`,{method:'DELETE',cookie:candCookie});
r=await ok(`/api/messages?conversation_id=${convId}`,{cookie:candCookie});assert.ok(!r.data.messages.some(x=>x.id===recv.id));
assert.ok(env.JOB_DB.prepare('SELECT id FROM messages WHERE id=?').bind(recv.id).first(),'message retained in DB');
r=await ok('/api/admin/messages',{cookie:adminCookie});assert.ok(r.data.private_messages.some(x=>x.id===recv.id),'message retained for admin');

// Candidature : annuler -> recruteur voit annulée -> réactiver -> annuler -> retirer -> masquée pour les deux, gardée Admin.
r=await ok('/api/candidate/applications',{cookie:candCookie});const appId=r.data.applications[0].id;
await ok(`/api/candidate/applications/${appId}/action`,{method:'POST',cookie:candCookie,body:{action:'cancel'}});
r=await ok('/api/candidate/applications',{cookie:candCookie});assert.equal(r.data.applications.find(x=>x.id===appId).status,'cancelled');
r=await ok('/api/recruiter/applications',{cookie:recCookie});assert.equal(r.data.applications.find(x=>x.id===appId).status,'cancelled');
await ok(`/api/candidate/applications/${appId}/action`,{method:'POST',cookie:candCookie,body:{action:'reactivate'}});
r=await ok('/api/candidate/applications',{cookie:candCookie});assert.equal(r.data.applications.find(x=>x.id===appId).status,'submitted');
await ok(`/api/candidate/applications/${appId}/action`,{method:'POST',cookie:candCookie,body:{action:'cancel'}});
await ok(`/api/candidate/applications/${appId}/action`,{method:'POST',cookie:candCookie,body:{action:'withdraw'}});
r=await ok('/api/candidate/applications',{cookie:candCookie});assert.ok(!r.data.applications.some(x=>x.id===appId));
r=await ok('/api/recruiter/applications',{cookie:recCookie});assert.ok(!r.data.applications.some(x=>x.id===appId));
r=await ok('/api/admin/applications',{cookie:adminCookie});const archived=r.data.applications.find(x=>x.id===appId);assert.ok(archived);assert.equal(archived.status,'withdrawn');

// Demande de suppression : pas de suppression directe, création support.
r=await ok('/api/account/delete-request',{method:'POST',cookie:candCookie,body:{}});assert.ok(r.data.request_id);
assert.ok(env.JOB_DB.prepare('SELECT id FROM users WHERE id=?').bind(candId).first(),'account still exists');
r=await ok('/api/admin/messages',{cookie:adminCookie});assert.ok(r.data.support_messages.some(x=>x.category==='account_deletion'&&Number(x.sender_user_id)===Number(candId)));
r=await call('/api/account',{method:'DELETE',cookie:candCookie});assert.equal(r.status,403);

console.log('V36_MEMBER_ACTIONS_OK');
