import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
const root=new URL('..',import.meta.url);
const code=readFileSync(new URL('../src/_worker.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
function norm(v){return v instanceof ArrayBuffer?new Uint8Array(v):v}
class P{constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args}bind(...a){return new P(this.db,this.sql,a.map(norm))}first(){return this.db.prepare(this.sql).get(...this.args)||null}all(){return {results:this.db.prepare(this.sql).all(...this.args)}}run(){const r=this.db.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes||0),last_row_id:Number(r.lastInsertRowid||0)}}}}
class D1{constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON')}prepare(s){return new P(this.db,s)}exec(s){this.db.exec(s);return {}}batch(ss){this.db.exec('BEGIN');try{const x=ss.map(s=>s.run());this.db.exec('COMMIT');return x}catch(e){this.db.exec('ROLLBACK');throw e}}}
class KV{constructor(){this.m=new Map()}async get(k){return this.m.get(k)??null}async put(k,v){this.m.set(k,String(v))}async delete(k){this.m.delete(k)}}
const d1=new D1();
const dir=new URL('../legacy_migrations_v26/',import.meta.url);
for(const name of readdirSync(dir).filter(x=>x.endsWith('.sql')).sort()) d1.db.exec(readFileSync(new URL(name,dir),'utf8'));
// runtime-only V26 job columns that old worker added automatically
for(const [n,t] of Object.entries({education_required:'TEXT',experience_required:'TEXT',skills_required:'TEXT',responsibilities:'TEXT',candidate_profile:'TEXT',work_schedule:'TEXT',availability_required:'TEXT',view_count:'INTEGER DEFAULT 0'})){
  const have=new Set(d1.db.prepare('PRAGMA table_info(jobs)').all().map(x=>x.name)); if(!have.has(n)) d1.db.exec(`ALTER TABLE jobs ADD COLUMN ${n} ${t}`);
}
d1.db.prepare("INSERT INTO users(id,email,phone,password_hash,password_salt,role,status,session_version) VALUES(10,'c@v26.ci','01','h','s','candidate','active',1)").run();
d1.db.prepare("INSERT INTO users(id,email,phone,password_hash,password_salt,role,status,session_version) VALUES(20,'r@v26.ci','07','h','s','recruiter','active',1)").run();
d1.db.prepare("INSERT INTO candidate_profiles(id,user_id,first_name,last_name,profession,city) VALUES(1,10,'Awa','V26','Comptable','Bouaké')").run();
d1.db.prepare("INSERT INTO recruiter_profiles(id,user_id,first_name,last_name,company_name,verification_status) VALUES(1,20,'Jean','V26','Entreprise V26','verified')").run();
d1.db.prepare("INSERT INTO subscriptions(user_id,plan,started_at,expires_at,status) VALUES(10,'standard',CURRENT_TIMESTAMP,'2099-12-31T00:00:00Z','active')").run();
d1.db.prepare("INSERT INTO subscriptions(user_id,plan,started_at,expires_at,status) VALUES(20,'business',CURRENT_TIMESTAMP,'2099-12-31T00:00:00Z','active')").run();
// Deliberately legacy-wrong profile ids
try{d1.db.exec('PRAGMA foreign_keys=OFF');d1.db.prepare("INSERT INTO jobs(id,recruiter_id,title,description,status,location) VALUES(100,1,'Offre V26','Desc','published','Abidjan')").run();d1.db.prepare("INSERT INTO applications(id,job_id,candidate_id,status) VALUES(200,100,1,'submitted')").run();d1.db.prepare("INSERT INTO recruitment_requests(id,recruiter_id,candidate_id,status) VALUES(300,1,1,'sent')").run();d1.db.exec('PRAGMA foreign_keys=ON')}catch(e){throw e}
const env={JOB_DB:d1,JOB_KV:new KV(),ASSETS:{fetch:async()=>new Response('asset')}};
const res=await worker.fetch(new Request('https://example.test/api/health'),env);const body=await res.json();assert.equal(res.status,200,JSON.stringify(body));
assert.equal(d1.db.prepare('SELECT recruiter_id FROM jobs WHERE id=100').get().recruiter_id,20);
assert.equal(d1.db.prepare('SELECT candidate_id FROM applications WHERE id=200').get().candidate_id,10);
const rr=d1.db.prepare('SELECT recruiter_id,candidate_id FROM recruitment_requests WHERE id=300').get();assert.equal(rr.recruiter_id,20);assert.equal(rr.candidate_id,10);
assert.ok(d1.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='legacy_v26_users'").get());
console.log('V27_FULL_V26_UPGRADE_OK');
