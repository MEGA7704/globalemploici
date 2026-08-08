import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
const code=readFileSync(new URL('../src/_worker.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
function norm(v){return v instanceof ArrayBuffer?new Uint8Array(v):v}
class P{constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args}bind(...a){return new P(this.db,this.sql,a.map(norm))}first(){return this.db.prepare(this.sql).get(...this.args)||null}all(){return {results:this.db.prepare(this.sql).all(...this.args)}}run(){const r=this.db.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes||0),last_row_id:Number(r.lastInsertRowid||0)}}}}
class D1{constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON')}prepare(s){return new P(this.db,s)}exec(s){this.db.exec(s);return {}}batch(ss){this.db.exec('BEGIN');try{const x=ss.map(s=>s.run());this.db.exec('COMMIT');return x}catch(e){this.db.exec('ROLLBACK');throw e}}}
class KV{constructor(){this.m=new Map()}async get(k){return this.m.get(k)??null}async put(k,v){this.m.set(k,String(v))}async delete(k){this.m.delete(k)}}
const d1=new D1();
// Representative V26 database, including wrong profile-id links.
d1.db.exec(`
CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT UNIQUE,phone TEXT,password_hash TEXT,password_salt TEXT,role TEXT,status TEXT,session_version INTEGER,created_at TEXT,updated_at TEXT,last_login_at TEXT);
CREATE TABLE candidate_profiles(id INTEGER PRIMARY KEY,user_id INTEGER UNIQUE,first_name TEXT,last_name TEXT,profession TEXT,city TEXT,created_at TEXT,updated_at TEXT);
CREATE TABLE recruiter_profiles(id INTEGER PRIMARY KEY,user_id INTEGER UNIQUE,company_name TEXT,city TEXT,verification_status TEXT,created_at TEXT,updated_at TEXT);
CREATE TABLE subscriptions(id INTEGER PRIMARY KEY,user_id INTEGER,plan TEXT,started_at TEXT,expires_at TEXT,status TEXT,created_at TEXT,updated_at TEXT);
CREATE TABLE jobs(id INTEGER PRIMARY KEY,recruiter_id INTEGER,title TEXT,description TEXT,status TEXT,location TEXT,created_at TEXT,updated_at TEXT);
CREATE TABLE applications(id INTEGER PRIMARY KEY,job_id INTEGER,candidate_id INTEGER,status TEXT,message TEXT,created_at TEXT,updated_at TEXT);
CREATE TABLE recruitment_requests(id INTEGER PRIMARY KEY,recruiter_id INTEGER,candidate_id INTEGER,status TEXT,message TEXT,created_at TEXT,updated_at TEXT);
INSERT INTO users VALUES(1,'candidate@legacy.ci','01','h','s','candidate','active',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL);
INSERT INTO users VALUES(2,'recruiter@legacy.ci','07','h','s','recruiter','active',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL);
INSERT INTO candidate_profiles(id,user_id,first_name,last_name,profession,city,created_at,updated_at) VALUES(88,1,'Awa','Legacy','Comptable','Bouaké',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO recruiter_profiles(id,user_id,company_name,city,verification_status,created_at,updated_at) VALUES(99,2,'Legacy SARL','Abidjan','verified',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO subscriptions VALUES(1,1,'standard',CURRENT_TIMESTAMP,'2099-01-01T00:00:00Z','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO subscriptions VALUES(2,2,'business',CURRENT_TIMESTAMP,'2099-01-01T00:00:00Z','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO jobs(id,recruiter_id,title,description,status,location,created_at,updated_at) VALUES(5,99,'Comptable Legacy','Test','published','Abidjan',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO applications(id,job_id,candidate_id,status,message,created_at,updated_at) VALUES(7,5,88,'submitted','Test',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO recruitment_requests(id,recruiter_id,candidate_id,status,message,created_at,updated_at) VALUES(9,99,88,'sent','Test',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
`);
const env={JOB_DB:d1,JOB_KV:new KV(),ASSETS:{fetch:async()=>new Response('asset')}};
const res=await worker.fetch(new Request('https://example.test/api/health'),env); const body=await res.json();
assert.equal(res.status,200,JSON.stringify(body));
assert.equal(body.ok,true);
assert.ok(d1.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='legacy_v26_users'").get());
assert.equal(d1.db.prepare('SELECT recruiter_id FROM jobs WHERE id=5').get().recruiter_id,2);
assert.equal(d1.db.prepare('SELECT candidate_id FROM applications WHERE id=7').get().candidate_id,1);
const rr=d1.db.prepare('SELECT recruiter_id,candidate_id FROM recruitment_requests WHERE id=9').get();assert.equal(rr.recruiter_id,2);assert.equal(rr.candidate_id,1);
assert.equal(d1.db.prepare('SELECT company_name FROM recruiter_profiles WHERE user_id=2').get().company_name,'Legacy SARL');
assert.equal(d1.db.prepare('SELECT first_name FROM candidate_profiles WHERE user_id=1').get().first_name,'Awa');
console.log('V27_LEGACY_IMPORT_OK');
