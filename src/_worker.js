const enc = new TextEncoder();
const dec = new TextDecoder();
const V27_SCHEMA_VERSION='27.0.0';
const LEGACY_PREFIX='legacy_v26_';
const BUSINESS_TABLES=['users','candidate_profiles','candidate_education','candidate_experiences','candidate_languages','candidate_documents','recruiter_profiles','recruiter_documents','subscriptions','subscription_requests','jobs','applications','recruitment_requests','conversations','conversation_members','messages','notifications','audit_logs','app_settings','support_messages'];

function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}})}
function nowISO(){return new Date().toISOString()}
function addDays(days){const d=new Date();d.setUTCDate(d.getUTCDate()+days);return d.toISOString()}
function parseCookies(req){const out={};(req.headers.get('cookie')||'').split(';').forEach(p=>{const i=p.indexOf('=');if(i>0)out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim())});return out}
function b64(bytes){return btoa(String.fromCharCode(...bytes))}
function fromB64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
function safeText(v,max=4000){return String(v??'').trim().slice(0,max)}
function candidateAgeFromBirthDate(value,reference=new Date()){
  const raw=safeText(value,20);
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if(!match) return null;
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const birth=new Date(Date.UTC(year,month-1,day));
  if(Number.isNaN(birth.getTime()) || birth.getUTCFullYear()!==year || birth.getUTCMonth()!==month-1 || birth.getUTCDate()!==day) return null;
  const now=new Date(reference);
  let age=now.getUTCFullYear()-year;
  const currentMonth=now.getUTCMonth()+1,currentDay=now.getUTCDate();
  if(currentMonth<month || (currentMonth===month && currentDay<day)) age--;
  return age;
}
function candidateIsAdult(value,reference=new Date()){
  const age=candidateAgeFromBirthDate(value,reference);
  return age!==null && age>=18;
}
function validEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)}
function sessionCookie(token,maxAge=86400){return `ge_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`}
function clearCookie(){return 'ge_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'}
function serverError(code,message,status=500){return json({error:message,code},status)}
function qid(v){if(!/^[A-Za-z0-9_]+$/.test(v))throw new Error('Unsafe identifier');return `"${v}"`}

function assertBindings(env){const missing=[];if(!env.JOB_DB)missing.push('JOB_DB');if(!env.JOB_KV)missing.push('JOB_KV');if(missing.length){const e=new Error('Missing bindings: '+missing.join(', '));e.code='BINDING_MISSING';e.publicMessage='Configuration Cloudflare incomplète : '+missing.join(', ');throw e}}
function assertAssetsBinding(env){if(!env.ASSETS){const e=new Error('Missing binding ASSETS');e.code='ASSETS_BINDING_MISSING';e.publicMessage='Le binding ASSETS de Cloudflare Pages est indisponible.';throw e}}

const CANONICAL_SCHEMA_SQL=`
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS v27_system_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL UNIQUE,phone TEXT,member_code TEXT,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('candidate','recruiter','super_admin')),status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','disabled')),session_version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_login_at TEXT);
CREATE TABLE IF NOT EXISTS candidate_profiles(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,first_name TEXT,last_name TEXT,profession TEXT,specialty TEXT,city TEXT,location TEXT,education TEXT,experience_years INTEGER DEFAULT 0,skills TEXT,description TEXT,availability TEXT,work_types TEXT,photo TEXT,gender TEXT,birth_date TEXT,nationality TEXT,marital_status TEXT,whatsapp TEXT,country TEXT,professional_title TEXT,activity_domain TEXT,other_skills TEXT,experience_level TEXT,current_situation TEXT,driving_license INTEGER DEFAULT 0,driving_category TEXT,education_level TEXT,target_position TEXT,target_domain TEXT,desired_contracts TEXT,desired_city TEXT,mobility TEXT,desired_salary INTEGER,accepts_travel INTEGER DEFAULT 0,job_alerts INTEGER DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS candidate_education(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,diploma TEXT,specialty TEXT,institution TEXT,graduation_year TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS candidate_experiences(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,position TEXT,company TEXT,city_country TEXT,start_date TEXT,end_date TEXT,current_job INTEGER NOT NULL DEFAULT 0,responsibilities TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS candidate_languages(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,language TEXT NOT NULL,level TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS candidate_documents(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,document_type TEXT NOT NULL,file_name TEXT NOT NULL,mime_type TEXT NOT NULL,size_bytes INTEGER NOT NULL,content BLOB NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS recruiter_profiles(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,recruiter_type TEXT,company_name TEXT,activity TEXT,description TEXT,city TEXT,address TEXT,logo TEXT,first_name TEXT,last_name TEXT,job_title TEXT,whatsapp TEXT,country TEXT,photo TEXT,trade_name TEXT,organization_type TEXT,sector TEXT,main_domain TEXT,foundation_year TEXT,employee_count TEXT,company_country TEXT,company_city TEXT,district TEXT,website TEXT,social_page TEXT,rccm TEXT,tax_id TEXT,cnps TEXT,desired_trades TEXT,recruitment_domains TEXT,annual_recruitment_count TEXT,contract_types TEXT,recruitment_zones TEXT,international_recruitment INTEGER DEFAULT 0,marketing_alerts INTEGER DEFAULT 0,verification_status TEXT NOT NULL DEFAULT 'unverified',verification_note TEXT,email_verified INTEGER DEFAULT 0,phone_verified INTEGER DEFAULT 0,company_info_verified INTEGER DEFAULT 0,official_document_verified INTEGER DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS recruiter_documents(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,document_type TEXT NOT NULL,file_name TEXT NOT NULL,mime_type TEXT NOT NULL,size_bytes INTEGER NOT NULL,content BLOB NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS subscriptions(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,plan TEXT NOT NULL CHECK(plan IN ('free','standard','business')),started_at TEXT NOT NULL,expires_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','cancelled')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS subscription_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,plan TEXT NOT NULL CHECK(plan IN ('standard','business')),amount INTEGER NOT NULL,payer_phone TEXT NOT NULL,transaction_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,admin_note TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,processed_at TEXT);
CREATE TABLE IF NOT EXISTS jobs(id INTEGER PRIMARY KEY AUTOINCREMENT,recruiter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,profession TEXT,category TEXT,description TEXT NOT NULL,employment_type TEXT,location TEXT,salary TEXT,vacancies INTEGER DEFAULT 1,status TEXT NOT NULL DEFAULT 'published',starts_at TEXT,closes_at TEXT,education_required TEXT,experience_required TEXT,skills_required TEXT,responsibilities TEXT,candidate_profile TEXT,work_schedule TEXT,availability_required TEXT,view_count INTEGER DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS applications(id INTEGER PRIMARY KEY AUTOINCREMENT,job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,candidate_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'submitted',message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(job_id,candidate_id));
CREATE TABLE IF NOT EXISTS recruitment_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,recruiter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,candidate_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'sent',message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(recruiter_id,candidate_id));
CREATE TABLE IF NOT EXISTS conversations(id INTEGER PRIMARY KEY AUTOINCREMENT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS conversation_members(conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(conversation_id,user_id));
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT,conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,content TEXT NOT NULL,read_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,type TEXT NOT NULL,title TEXT NOT NULL,content TEXT NOT NULL,is_read INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,action TEXT NOT NULL,target_type TEXT,target_id TEXT,metadata TEXT,ip_hash TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS app_settings(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS support_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,sender_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,recipient_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,subject TEXT,content TEXT NOT NULL,category TEXT NOT NULL DEFAULT 'support',status TEXT NOT NULL DEFAULT 'unread',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS user_hidden_items(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,item_type TEXT NOT NULL,item_id INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_type,item_id));
CREATE INDEX IF NOT EXISTS v27_idx_subscriptions_user ON subscriptions(user_id,expires_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS v27_uq_pending_request_user ON subscription_requests(user_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS v27_idx_jobs_recruiter ON jobs(recruiter_id,created_at DESC);
CREATE INDEX IF NOT EXISTS v27_idx_applications_candidate ON applications(candidate_id,created_at DESC);
CREATE INDEX IF NOT EXISTS v27_idx_applications_job ON applications(job_id,created_at DESC);
CREATE INDEX IF NOT EXISTS v27_idx_recruitment_recruiter ON recruitment_requests(recruiter_id,created_at DESC);
CREATE INDEX IF NOT EXISTS v27_idx_recruitment_candidate ON recruitment_requests(candidate_id,created_at DESC);
CREATE INDEX IF NOT EXISTS v27_idx_notifications_user ON notifications(user_id,is_read,created_at DESC);
CREATE INDEX IF NOT EXISTS v27_idx_support_recipient ON support_messages(recipient_user_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS v27_idx_support_sender ON support_messages(sender_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS v36_idx_hidden_user_type ON user_hidden_items(user_id,item_type,item_id);
INSERT OR IGNORE INTO app_settings(key,value) VALUES ('platform_name','GLOBAL EMPLOI'),('support_whatsapp','+2250777041790'),('wave_payment_url','https://pay.wave.com/m/M_ci_Enx-2JNAklk-/c/ci/?amount='),('standard_price','1000'),('business_price','10000'),('free_days','0'),('standard_days','30'),('business_days','365'),('default_country','Côte d''Ivoire'),('contact_email','');
`;

let schemaReadyPromise=null;
let clientActionSchemaPromise=null;
let clientActionSchemaAvailable=null;
let memberCodeSchemaPromise=null;
let memberCodeSchemaReady=null;
async function tableExists(env,name){const r=await env.JOB_DB.prepare("SELECT 1 ok FROM sqlite_master WHERE type='table' AND name=?").bind(name).first();return !!r}
async function tableColumns(env,name){if(!await tableExists(env,name))return new Set();const r=await env.JOB_DB.prepare(`PRAGMA table_info(${name})`).all();return new Set((r.results||[]).map(x=>x.name))}

async function archiveLegacyTables(env){
  for(const name of BUSINESS_TABLES){
    const legacy=LEGACY_PREFIX+name;
    const hasCurrent=await tableExists(env,name),hasLegacy=await tableExists(env,legacy);
    if(hasCurrent&&!hasLegacy) await env.JOB_DB.prepare(`ALTER TABLE ${qid(name)} RENAME TO ${qid(legacy)}`).run();
  }
}
async function importSimpleTable(env,src,dst,columns,where=''){
  if(!await tableExists(env,src))return {table:src,imported:0,skipped:true};
  const have=await tableColumns(env,src);const use=columns.filter(c=>have.has(c));if(!use.length)return {table:src,imported:0,skipped:true};
  const sql=`INSERT OR IGNORE INTO ${qid(dst)}(${use.map(qid).join(',')}) SELECT ${use.map(c=>'s.'+qid(c)).join(',')} FROM ${qid(src)} s ${where}`;
  const r=await env.JOB_DB.prepare(sql).run();return {table:src,imported:Number(r?.meta?.changes||0)}
}
async function importLegacyData(env){
  const report=[];
  const lu=LEGACY_PREFIX+'users';
  if(await tableExists(env,lu)){
    const have=await tableColumns(env,lu);const cols=['id','email','phone','password_hash','password_salt','role','status','session_version','created_at','updated_at','last_login_at'].filter(c=>have.has(c));
    if(['id','email','password_hash','password_salt','role'].every(c=>have.has(c))){const r=await env.JOB_DB.prepare(`INSERT OR IGNORE INTO users(${cols.map(qid).join(',')}) SELECT ${cols.map(c=>'s.'+qid(c)).join(',')} FROM ${qid(lu)} s WHERE s.role IN ('candidate','recruiter','super_admin')`).run();report.push({table:'users',imported:Number(r?.meta?.changes||0)})}
  }
  const simple=[
    ['candidate_profiles',['id','user_id','first_name','last_name','profession','specialty','city','location','education','experience_years','skills','description','availability','work_types','photo','gender','birth_date','nationality','marital_status','whatsapp','country','professional_title','activity_domain','other_skills','experience_level','current_situation','driving_license','driving_category','education_level','target_position','target_domain','desired_contracts','desired_city','mobility','desired_salary','accepts_travel','job_alerts','created_at','updated_at'],"WHERE EXISTS(SELECT 1 FROM users u WHERE u.id=s.user_id AND u.role='candidate')"],
    ['candidate_education',['id','user_id','diploma','specialty','institution','graduation_year','created_at'],"WHERE EXISTS(SELECT 1 FROM users u WHERE u.id=s.user_id AND u.role='candidate')"],
    ['candidate_experiences',['id','user_id','position','company','city_country','start_date','end_date','current_job','responsibilities','created_at'],"WHERE EXISTS(SELECT 1 FROM users u WHERE u.id=s.user_id AND u.role='candidate')"],
    ['candidate_languages',['id','user_id','language','level','created_at'],"WHERE EXISTS(SELECT 1 FROM users u WHERE u.id=s.user_id AND u.role='candidate')"],
    ['candidate_documents',['id','user_id','document_type','file_name','mime_type','size_bytes','content','created_at'],"WHERE EXISTS(SELECT 1 FROM users u WHERE u.id=s.user_id AND u.role='candidate')"],
    ['recruiter_profiles',['id','user_id','recruiter_type','company_name','activity','description','city','address','logo','first_name','last_name','job_title','whatsapp','country','photo','trade_name','organization_type','sector','main_domain','foundation_year','employee_count','company_country','company_city','district','website','social_page','rccm','tax_id','cnps','desired_trades','recruitment_domains','annual_recruitment_count','contract_types','recruitment_zones','international_recruitment','marketing_alerts','verification_status','verification_note','email_verified','phone_verified','company_info_verified','official_document_verified','created_at','updated_at'],"WHERE EXISTS(SELECT 1 FROM users u WHERE u.id=s.user_id AND u.role='recruiter')"],
    ['recruiter_documents',['id','user_id','document_type','file_name','mime_type','size_bytes','content','created_at'],"WHERE EXISTS(SELECT 1 FROM users u WHERE u.id=s.user_id AND u.role='recruiter')"],
    ['subscriptions',['id','user_id','plan','started_at','expires_at','status','created_at','updated_at'],"WHERE EXISTS(SELECT 1 FROM users u WHERE u.id=s.user_id)"],
    ['subscription_requests',['id','user_id','plan','amount','payer_phone','transaction_id','status','admin_id','admin_note','created_at','processed_at'],"WHERE EXISTS(SELECT 1 FROM users u WHERE u.id=s.user_id)"],
  ];
  for(const [name,cols,where] of simple)report.push(await importSimpleTable(env,LEGACY_PREFIX+name,name,cols,where));
  const lj=LEGACY_PREFIX+'jobs';
  if(await tableExists(env,lj)){
    const have=await tableColumns(env,lj);if(have.has('recruiter_id')&&have.has('title')&&have.has('description')){
      const optional=['id','title','profession','category','description','employment_type','location','salary','vacancies','status','starts_at','closes_at','education_required','experience_required','skills_required','responsibilities','candidate_profile','work_schedule','availability_required','view_count','created_at','updated_at'].filter(c=>have.has(c));
      const rid=`CASE WHEN EXISTS(SELECT 1 FROM users u WHERE u.id=j.recruiter_id AND u.role='recruiter') THEN j.recruiter_id ELSE (SELECT rp.user_id FROM ${qid(LEGACY_PREFIX+'recruiter_profiles')} rp JOIN users u ON u.id=rp.user_id AND u.role='recruiter' WHERE rp.id=j.recruiter_id LIMIT 1) END`;
      const r=await env.JOB_DB.prepare(`INSERT OR IGNORE INTO jobs(${['recruiter_id',...optional].map(qid).join(',')}) SELECT ${[rid,...optional.map(c=>'j.'+qid(c))].join(',')} FROM ${qid(lj)} j WHERE COALESCE(${rid},0)>0`).run();report.push({table:'jobs',imported:Number(r?.meta?.changes||0)})
    }
  }
  const la=LEGACY_PREFIX+'applications';
  if(await tableExists(env,la)){
    const have=await tableColumns(env,la);if(have.has('job_id')&&have.has('candidate_id')){
      const optional=['id','status','message','created_at','updated_at'].filter(c=>have.has(c));
      const cid=`CASE WHEN EXISTS(SELECT 1 FROM users u WHERE u.id=a.candidate_id AND u.role='candidate') THEN a.candidate_id ELSE (SELECT cp.user_id FROM ${qid(LEGACY_PREFIX+'candidate_profiles')} cp JOIN users u ON u.id=cp.user_id AND u.role='candidate' WHERE cp.id=a.candidate_id LIMIT 1) END`;
      const r=await env.JOB_DB.prepare(`INSERT OR IGNORE INTO applications(${['job_id','candidate_id',...optional].map(qid).join(',')}) SELECT ${['a.job_id',cid,...optional.map(c=>'a.'+qid(c))].join(',')} FROM ${qid(la)} a WHERE EXISTS(SELECT 1 FROM jobs j WHERE j.id=a.job_id) AND COALESCE(${cid},0)>0`).run();report.push({table:'applications',imported:Number(r?.meta?.changes||0)})
    }
  }
  const lrr=LEGACY_PREFIX+'recruitment_requests';
  if(await tableExists(env,lrr)){
    const have=await tableColumns(env,lrr);if(have.has('recruiter_id')&&have.has('candidate_id')){
      const optional=['id','status','message','created_at','updated_at'].filter(c=>have.has(c));
      const rid=`CASE WHEN EXISTS(SELECT 1 FROM users u WHERE u.id=r.recruiter_id AND u.role='recruiter') THEN r.recruiter_id ELSE (SELECT rp.user_id FROM ${qid(LEGACY_PREFIX+'recruiter_profiles')} rp JOIN users u ON u.id=rp.user_id AND u.role='recruiter' WHERE rp.id=r.recruiter_id LIMIT 1) END`;
      const cid=`CASE WHEN EXISTS(SELECT 1 FROM users u WHERE u.id=r.candidate_id AND u.role='candidate') THEN r.candidate_id ELSE (SELECT cp.user_id FROM ${qid(LEGACY_PREFIX+'candidate_profiles')} cp JOIN users u ON u.id=cp.user_id AND u.role='candidate' WHERE cp.id=r.candidate_id LIMIT 1) END`;
      const r=await env.JOB_DB.prepare(`INSERT OR IGNORE INTO recruitment_requests(${['recruiter_id','candidate_id',...optional].map(qid).join(',')}) SELECT ${[rid,cid,...optional.map(c=>'r.'+qid(c))].join(',')} FROM ${qid(lrr)} r WHERE COALESCE(${rid},0)>0 AND COALESCE(${cid},0)>0`).run();report.push({table:'recruitment_requests',imported:Number(r?.meta?.changes||0)})
    }
  }
  for(const [name,cols] of [['conversations',['id','created_at','updated_at']],['conversation_members',['conversation_id','user_id']],['messages',['id','conversation_id','sender_id','content','read_at','created_at']],['notifications',['id','user_id','type','title','content','is_read','created_at']],['audit_logs',['id','actor_user_id','action','target_type','target_id','metadata','ip_hash','created_at']],['app_settings',['key','value','updated_at','updated_by']],['support_messages',['id','sender_user_id','recipient_user_id','subject','content','category','status','created_at','updated_at']]]){
    try{report.push(await importSimpleTable(env,LEGACY_PREFIX+name,name,cols))}catch(e){report.push({table:name,error:String(e?.message||e).slice(0,160)})}
  }
  await env.JOB_DB.exec(`
    INSERT OR IGNORE INTO candidate_profiles(user_id,created_at,updated_at) SELECT id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM users WHERE role='candidate';
    INSERT OR IGNORE INTO recruiter_profiles(user_id,verification_status,created_at,updated_at) SELECT id,'unverified',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM users WHERE role='recruiter';
    INSERT INTO subscriptions(user_id,plan,started_at,expires_at,status,created_at,updated_at) SELECT u.id,'free',CURRENT_TIMESTAMP,'2099-12-31T23:59:59Z','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM users u WHERE u.role IN ('candidate','recruiter') AND NOT EXISTS(SELECT 1 FROM subscriptions s WHERE s.user_id=u.id);
  `);
  await env.JOB_DB.prepare("INSERT INTO v27_system_meta(key,value,updated_at) VALUES('legacy_import_report',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(report).slice(0,14000)).run();
}

async function ensureRuntimeSchema(env){
  if(!schemaReadyPromise){schemaReadyPromise=(async()=>{
    try{
      await env.JOB_DB.exec("CREATE TABLE IF NOT EXISTS v27_system_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
      const current=await env.JOB_DB.prepare("SELECT value FROM v27_system_meta WHERE key='schema_version'").first();
      if(current?.value!==V27_SCHEMA_VERSION){
        await archiveLegacyTables(env);
        await env.JOB_DB.exec(CANONICAL_SCHEMA_SQL);
        await importLegacyData(env);
        await env.JOB_DB.prepare("INSERT INTO v27_system_meta(key,value,updated_at) VALUES('schema_version',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(V27_SCHEMA_VERSION).run();
      }
      await checkDatabase(env);
      return true;
    }catch(err){schemaReadyPromise=null;const e=new Error(`V27 bootstrap failed: ${err?.message||err}`);e.code='SCHEMA_BOOTSTRAP_FAILED';e.publicMessage='La reconstruction V27 de la base D1 a échoué.';throw e}
  })()}
  return schemaReadyPromise
}
async function checkDatabase(env){const required=BUSINESS_TABLES;const rows=await env.JOB_DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();const have=new Set((rows.results||[]).map(r=>r.name));const missing=required.filter(t=>!have.has(t));if(missing.length){const e=new Error('V27 missing tables: '+missing.join(', '));e.code='D1_SCHEMA_INCOMPLETE';e.publicMessage='Schéma D1 V27 incomplet : '+missing.join(', ');throw e}return true}
async function checkKV(env){const key='v27:health:'+crypto.randomUUID();await env.JOB_KV.put(key,'1',{expirationTtl:60});const got=await env.JOB_KV.get(key);await env.JOB_KV.delete(key);if(got!=='1'){const e=new Error('KV read/write failed');e.code='KV_UNAVAILABLE';e.publicMessage='Le namespace KV ne répond pas correctement.';throw e}return true}
async function hasClientActionSchema(env){
  if(clientActionSchemaAvailable!==null) return clientActionSchemaAvailable;
  clientActionSchemaAvailable=await tableExists(env,'user_hidden_items');
  return clientActionSchemaAvailable;
}
async function ensureClientActionSchema(env){
  if(await hasClientActionSchema(env)) return true;
  if(!clientActionSchemaPromise){clientActionSchemaPromise=(async()=>{
    try{
      await env.JOB_DB.exec(`CREATE TABLE IF NOT EXISTS user_hidden_items(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,item_type TEXT NOT NULL,item_id INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_type,item_id));CREATE INDEX IF NOT EXISTS v36_idx_hidden_user_type ON user_hidden_items(user_id,item_type,item_id);`);
      clientActionSchemaAvailable=true;
      return true;
    }catch(err){clientActionSchemaPromise=null;clientActionSchemaAvailable=null;throw err}
  })()}
  return clientActionSchemaPromise;
}
async function ensureDataLinkage(env){const q=async(sql)=>Number((await env.JOB_DB.prepare(sql).first())?.n||0);return {missing_candidate_profiles:await q("SELECT COUNT(*) n FROM users u WHERE u.role='candidate' AND NOT EXISTS(SELECT 1 FROM candidate_profiles p WHERE p.user_id=u.id)"),missing_recruiter_profiles:await q("SELECT COUNT(*) n FROM users u WHERE u.role='recruiter' AND NOT EXISTS(SELECT 1 FROM recruiter_profiles p WHERE p.user_id=u.id)"),orphan_jobs:await q("SELECT COUNT(*) n FROM jobs j WHERE NOT EXISTS(SELECT 1 FROM users u WHERE u.id=j.recruiter_id AND u.role='recruiter')"),orphan_applications:await q("SELECT COUNT(*) n FROM applications a WHERE NOT EXISTS(SELECT 1 FROM jobs j WHERE j.id=a.job_id) OR NOT EXISTS(SELECT 1 FROM users u WHERE u.id=a.candidate_id AND u.role='candidate')"),orphan_recruitment_requests:await q("SELECT COUNT(*) n FROM recruitment_requests r WHERE NOT EXISTS(SELECT 1 FROM users u WHERE u.id=r.recruiter_id AND u.role='recruiter') OR NOT EXISTS(SELECT 1 FROM users u WHERE u.id=r.candidate_id AND u.role='candidate')")}}

async function hashPassword(password, saltBytes){
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:saltBytes,iterations:100000}, key, 256);
  return b64(new Uint8Array(bits));
}
async function createPassword(password){ const salt=crypto.getRandomValues(new Uint8Array(16)); return {salt:b64(salt), hash:await hashPassword(password,salt)}; }
async function verifyPassword(password,salt,hash){ const got=await hashPassword(password,fromB64(salt)); return timingSafe(got,hash); }
function timingSafe(a,b){ if(a.length!==b.length) return false; let x=0; for(let i=0;i<a.length;i++) x|=a.charCodeAt(i)^b.charCodeAt(i); return x===0; }

async function getSession(req, env){
  const token=parseCookies(req).ge_session; if(!token) return null;
  const raw=await env.JOB_KV.get(`sess:${token}`); if(!raw) return null;
  let s; try{s=JSON.parse(raw);}catch{return null;}
  const u=await env.JOB_DB.prepare('SELECT id,email,phone,member_code,role,status,session_version FROM users WHERE id=?').bind(s.userId).first();
  if(!u || u.status!=='active' || u.session_version!==s.version){ await env.JOB_KV.delete(`sess:${token}`); return null; }
  return {...s, token, user:u};
}
async function requireSession(req,env){ const s=await getSession(req,env); if(!s) throw new Response(JSON.stringify({error:'Authentification requise'}),{status:401,headers:{'content-type':'application/json'}}); return s; }
async function requireAdmin(req,env){ const s=await requireSession(req,env); if(s.user.role!=='super_admin') throw new Response(JSON.stringify({error:'Accès interdit'}),{status:403,headers:{'content-type':'application/json'}}); return s; }
async function requireRole(req,env,role){ const s=await requireSession(req,env); if(s.user.role!==role) throw new Response(JSON.stringify({error:`Accès réservé au rôle ${role}.`}),{status:403,headers:{'content-type':'application/json'}}); return s; }
async function createSession(env,user){ const token=crypto.randomUUID()+crypto.randomUUID().replaceAll('-',''); await env.JOB_KV.put(`sess:${token}`,JSON.stringify({userId:user.id,version:user.session_version}),{expirationTtl:86400}); return token; }

async function checkRate(req,env,email){
  const ip=req.headers.get('CF-Connecting-IP')||'unknown'; const key=`login:${ip}:${email.toLowerCase()}`;
  const count=Number(await env.JOB_KV.get(key)||0); if(count>=8) return false;
  await env.JOB_KV.put(key,String(count+1),{expirationTtl:900}); return true;
}
async function clearRate(req,env,email){ const ip=req.headers.get('CF-Connecting-IP')||'unknown'; await env.JOB_KV.delete(`login:${ip}:${email.toLowerCase()}`); }
async function audit(env,actor,action,targetType=null,targetId=null,meta=null){
  try{await env.JOB_DB.prepare('INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES(?,?,?,?,?)').bind(actor||null,action,targetType,targetId?String(targetId):null,meta?JSON.stringify(meta):null).run();}catch{}
}
async function currentSubscription(env,userId){
  const s=await env.JOB_DB.prepare(`SELECT * FROM subscriptions WHERE user_id=?
    ORDER BY CASE
      WHEN status='active' AND plan IN ('standard','business') AND datetime(expires_at)>datetime('now') THEN 0
      WHEN status='active' AND plan='free' THEN 1
      ELSE 2 END,
      id DESC LIMIT 1`).bind(userId).first();
  if(!s) return null;
  const active=s.status==='active' && (s.plan==='free' || new Date(s.expires_at)>new Date());
  return {...s, effective_status:active?'active':'expired'};
}
function memberCodePrefix(role){return role==='recruiter'?'RE':role==='candidate'?'DE':'US'}
function memberCodeYear(createdAt){const d=createdAt?new Date(createdAt):new Date();return String(Number.isFinite(d.getTime())?d.getUTCFullYear():new Date().getUTCFullYear())}
function buildMemberCode(role,createdAt,id){return `GE-${memberCodePrefix(role)}-${memberCodeYear(createdAt)}-${String(Number(id)||0).padStart(5,'0')}`}
async function assignMemberCode(env,userId,role,createdAt){const code=buildMemberCode(role,createdAt,userId);await env.JOB_DB.prepare('UPDATE users SET member_code=?,updated_at=? WHERE id=?').bind(code,nowISO(),userId).run();return code}
async function ensureMemberCodeSchema(env){
  if(memberCodeSchemaReady!==null) return memberCodeSchemaReady;
  if(!memberCodeSchemaPromise){memberCodeSchemaPromise=(async()=>{
    try{
      const cols=await tableColumns(env,'users');
      if(!cols.has('member_code')) await env.JOB_DB.exec('ALTER TABLE users ADD COLUMN member_code TEXT;');
      const rows=await env.JOB_DB.prepare("SELECT id,role,created_at FROM users WHERE role IN ('candidate','recruiter') AND (member_code IS NULL OR trim(member_code)='') ORDER BY id ASC").all();
      for(const row of (rows.results||[])){
        await env.JOB_DB.prepare('UPDATE users SET member_code=?,updated_at=? WHERE id=?').bind(buildMemberCode(row.role,row.created_at,row.id),nowISO(),row.id).run();
      }
      memberCodeSchemaReady=true; return true;
    }catch(err){memberCodeSchemaPromise=null;memberCodeSchemaReady=null;throw err}
  })()}
  return memberCodeSchemaPromise
}
async function expireJobs(env){await env.JOB_DB.prepare("UPDATE jobs SET status='expired',updated_at=? WHERE status='published' AND COALESCE(closes_at,'')<>'' AND datetime(closes_at)<=datetime('now')").bind(nowISO()).run()}

async function ensureCandidateSchema(env){
  return true;
}
async function ensureRecruiterSchema(env){
  return true;
}
async function recruiterCompleteness(env,userId){
  await ensureRecruiterSchema(env);
  const p=await env.JOB_DB.prepare('SELECT * FROM recruiter_profiles WHERE user_id=?').bind(userId).first()||{};
  const u=await env.JOB_DB.prepare('SELECT email,phone FROM users WHERE id=?').bind(userId).first()||{};
  const docs=await env.JOB_DB.prepare('SELECT COUNT(*) n FROM recruiter_documents WHERE user_id=?').bind(userId).first();
  const checks=[
    p.first_name,p.last_name,p.job_title,u.phone,u.email,p.country,
    p.company_name,p.organization_type,p.sector,p.main_domain,p.description,
    p.company_country,p.company_city,p.address,p.desired_trades,p.recruitment_domains,
    p.annual_recruitment_count,p.contract_types,p.recruitment_zones,Number(docs?.n)>0
  ];
  const percent=Math.round(checks.filter(Boolean).length/checks.length*100);
  const recommendations=[];
  if(!p.company_name) recommendations.push('Ajouter la raison sociale de l’entreprise');
  if(!p.sector||!p.main_domain) recommendations.push('Compléter le secteur et le domaine d’activité');
  if(!p.desired_trades) recommendations.push('Indiquer les métiers généralement recherchés');
  if(!Number(docs?.n)) recommendations.push('Ajouter un document justificatif');
  if(p.verification_status!=='verified') recommendations.push('Soumettre le compte à la vérification');
  return {percent,recommendations,verification_status:p.verification_status||'unverified'};
}
function parseList(v){ if(Array.isArray(v)) return v; try{ const x=JSON.parse(String(v||'[]')); return Array.isArray(x)?x:[]; }catch{return [];} }
async function candidateCompleteness(env,userId){
  await ensureCandidateSchema(env);
  const p=await env.JOB_DB.prepare('SELECT * FROM candidate_profiles WHERE user_id=?').bind(userId).first()||{};
  const u=await env.JOB_DB.prepare('SELECT email,phone FROM users WHERE id=?').bind(userId).first()||{};
  const edu=await env.JOB_DB.prepare('SELECT COUNT(*) n FROM candidate_education WHERE user_id=?').bind(userId).first();
  const exp=await env.JOB_DB.prepare('SELECT COUNT(*) n FROM candidate_experiences WHERE user_id=?').bind(userId).first();
  const lang=await env.JOB_DB.prepare('SELECT COUNT(*) n FROM candidate_languages WHERE user_id=?').bind(userId).first();
  const docs=await env.JOB_DB.prepare("SELECT document_type,COUNT(*) n FROM candidate_documents WHERE user_id=? GROUP BY document_type").bind(userId).all();
  const docTypes=new Set((docs.results||[]).map(x=>x.document_type));
  const checks=[p.first_name,p.last_name,p.gender,p.birth_date,p.nationality,u.phone,u.email,p.city,p.country,p.professional_title,p.activity_domain,p.profession,p.experience_level,p.current_situation,p.description,p.skills,p.education_level,p.target_position,p.target_domain,p.desired_contracts,p.mobility,p.availability,Number(edu?.n)>0,Number(exp?.n)>0,Number(lang?.n)>0,docTypes.has('cv')];
  const complete=checks.filter(Boolean).length;
  const percent=Math.round(complete/checks.length*100);
  const recommendations=[];
  if(!docTypes.has('cv')) recommendations.push('Ajouter votre CV');
  if(!Number(exp?.n)) recommendations.push('Ajouter une expérience');
  if(!p.skills) recommendations.push('Compléter vos compétences');
  if(!Number(edu?.n)) recommendations.push('Ajouter un diplôme ou une formation');
  if(!Number(lang?.n)) recommendations.push('Ajouter vos langues');
  return {percent,recommendations};
}


async function ensureRecruitmentSchema(env){
  return true;
}
async function deleteUserAndRelatedData(env,userId){
  await ensureCandidateSchema(env);
  await ensureRecruiterSchema(env);
  await ensureRecruitmentSchema(env);
  const conversations=await env.JOB_DB.prepare('SELECT conversation_id FROM conversation_members WHERE user_id=?').bind(userId).all();
  const cids=(conversations.results||[]).map(x=>Number(x.conversation_id)).filter(Boolean);
  const statements=[
    env.JOB_DB.prepare('UPDATE audit_logs SET actor_user_id=NULL WHERE actor_user_id=?').bind(userId),
    env.JOB_DB.prepare('UPDATE subscription_requests SET admin_id=NULL WHERE admin_id=?').bind(userId),
    env.JOB_DB.prepare('DELETE FROM recruitment_requests WHERE recruiter_id=? OR candidate_id=?').bind(userId,userId),
    env.JOB_DB.prepare('DELETE FROM applications WHERE candidate_id=?').bind(userId),
    env.JOB_DB.prepare('DELETE FROM jobs WHERE recruiter_id=?').bind(userId),
    env.JOB_DB.prepare('DELETE FROM notifications WHERE user_id=?').bind(userId),
    env.JOB_DB.prepare('DELETE FROM user_hidden_items WHERE user_id=?').bind(userId),
    env.JOB_DB.prepare('DELETE FROM candidate_documents WHERE user_id=?').bind(userId),
    env.JOB_DB.prepare('DELETE FROM candidate_education WHERE user_id=?').bind(userId),
    env.JOB_DB.prepare('DELETE FROM candidate_experiences WHERE user_id=?').bind(userId),
    env.JOB_DB.prepare('DELETE FROM candidate_languages WHERE user_id=?').bind(userId),
    env.JOB_DB.prepare('DELETE FROM recruiter_documents WHERE user_id=?').bind(userId),
    env.JOB_DB.prepare('DELETE FROM candidate_profiles WHERE user_id=?').bind(userId),
    env.JOB_DB.prepare('DELETE FROM recruiter_profiles WHERE user_id=?').bind(userId),
    env.JOB_DB.prepare('DELETE FROM subscriptions WHERE user_id=?').bind(userId),
    env.JOB_DB.prepare('DELETE FROM subscription_requests WHERE user_id=?').bind(userId),
    env.JOB_DB.prepare('DELETE FROM messages WHERE sender_id=?').bind(userId),
    env.JOB_DB.prepare('DELETE FROM conversation_members WHERE user_id=?').bind(userId),
    env.JOB_DB.prepare('DELETE FROM users WHERE id=?').bind(userId)
  ];
  await env.JOB_DB.batch(statements);
  for(const cid of cids){
    const left=await env.JOB_DB.prepare('SELECT COUNT(*) n FROM conversation_members WHERE conversation_id=?').bind(cid).first();
    if(Number(left?.n||0)<2) await env.JOB_DB.prepare('DELETE FROM conversations WHERE id=?').bind(cid).run();
  }
}

async function activePaidSubscription(env,userId){
  const s=await env.JOB_DB.prepare(`SELECT plan,expires_at,status FROM subscriptions
    WHERE user_id=? AND status='active' AND plan IN ('standard','business')
    AND datetime(expires_at)>datetime('now')
    ORDER BY datetime(expires_at) DESC LIMIT 1`).bind(userId).first();
  return s||null;
}
async function cleanupExpiredFreeAccounts(env){
  const lock='maintenance:subscriptions:v24';
  if(await env.JOB_KV.get(lock)) return;
  await env.JOB_KV.put(lock,'1',{expirationTtl:60});
  const now=nowISO();

  // 1) Expire uniquement les payants réellement arrivés à terme.
  await env.JOB_DB.prepare(`UPDATE subscriptions SET status='expired',updated_at=?
    WHERE plan IN ('standard','business') AND status='active' AND datetime(expires_at)<=datetime('now')`).bind(now).run();

  // 2) Tant qu'un payant est actif, les anciennes lignes FREE restent expirées pour ne pas fausser les statistiques.
  await env.JOB_DB.prepare(`UPDATE subscriptions SET status='expired',updated_at=?
    WHERE plan='free' AND status='active'
      AND EXISTS(SELECT 1 FROM subscriptions p WHERE p.user_id=subscriptions.user_id
        AND p.plan IN ('standard','business') AND p.status='active' AND datetime(p.expires_at)>datetime('now'))`).bind(now).run();

  // 3) Sans payant actif, la dernière ligne FREE devient permanente pour la consultation.
  await env.JOB_DB.prepare(`UPDATE subscriptions SET status='active',expires_at='2099-12-31T23:59:59Z',updated_at=?
    WHERE id IN (
      SELECT MAX(f.id) FROM subscriptions f JOIN users u ON u.id=f.user_id
      WHERE f.plan='free' AND u.role IN ('candidate','recruiter')
        AND NOT EXISTS(SELECT 1 FROM subscriptions p WHERE p.user_id=f.user_id
          AND p.plan IN ('standard','business') AND p.status='active' AND datetime(p.expires_at)>datetime('now'))
      GROUP BY f.user_id
    )`).bind(now).run();

  // 4) Un ancien compte sans ligne FREE en reçoit une, sans supprimer son historique.
  await env.JOB_DB.prepare(`INSERT INTO subscriptions(user_id,plan,started_at,expires_at,status,created_at,updated_at)
    SELECT u.id,'free',?,'2099-12-31T23:59:59Z','active',?,? FROM users u
    WHERE u.role IN ('candidate','recruiter')
      AND NOT EXISTS(SELECT 1 FROM subscriptions p WHERE p.user_id=u.id
        AND p.plan IN ('standard','business') AND p.status='active' AND datetime(p.expires_at)>datetime('now'))
      AND NOT EXISTS(SELECT 1 FROM subscriptions f WHERE f.user_id=u.id AND f.plan='free')`).bind(now,now,now).run();

  // 5) Réactive uniquement les comptes désactivés automatiquement par les anciennes versions.
  // Une désactivation explicite faite depuis l'Admin reste respectée grâce au dernier audit USER_STATUS_CHANGED.
  await env.JOB_DB.prepare(`UPDATE users SET status='active',updated_at=?
    WHERE role IN ('candidate','recruiter') AND status='disabled'
      AND COALESCE((SELECT a.metadata FROM audit_logs a
        WHERE a.action='USER_STATUS_CHANGED' AND a.target_type='user' AND a.target_id=CAST(users.id AS TEXT)
        ORDER BY a.id DESC LIMIT 1),'') NOT LIKE '%\"status\":\"disabled\"%'`).bind(now).run();
}

async function ensureAdminModuleSchema(env){
  return true;
}
async function ensureAdminDataReady(env){
  // V31 : une page Admin ne doit jamais lancer une migration globale ni un audit de toute la base.
  // Les routes Admin lisent directement leurs tables métiers. Les diagnostics globaux restent
  // disponibles uniquement via /api/health et /api/data-linkage.
  return true;
}
async function getAppSettings(env){
  await ensureAdminModuleSchema(env);
  const rows=await env.JOB_DB.prepare('SELECT key,value FROM app_settings').all();
  const map={};
  for(const row of (rows.results||[])) map[row.key]=row.value;
  return map;
}

async function ensureRecruiterProSchema(env){
  return true;
}
async function readRegisterBody(req){
  const ct=String(req.headers.get('content-type')||'').toLowerCase();
  if(ct.includes('application/json')) return {body:await req.json().catch(()=>({})),nativeForm:false};
  if(ct.includes('application/x-www-form-urlencoded')||ct.includes('multipart/form-data')){
    const fd=await req.formData().catch(()=>null);
    return {body:fd?Object.fromEntries(fd):{},nativeForm:true};
  }
  return {body:{},nativeForm:false};
}
async function handleRegister(req,env){
  const parsed=await readRegisterBody(req);
  const b=parsed.body; const role=b.role==='recruiter'?'recruiter':'candidate';
  // Les cases HTML natives arrivent comme "1" ou "on".
  b.terms=b.terms===true||b.terms==='1'||b.terms==='on';
  b.privacy=b.privacy===true||b.privacy==='1'||b.privacy==='on';
  const email=safeText(b.email,190).toLowerCase(), password=String(b.password||''), phone=safeText(b.phone,40);
  if(!validEmail(email)||password.length<8) return json({error:'E-mail invalide ou mot de passe trop court.'},400);
  if(role==='candidate' && (!b.terms || !safeText(b.last_name,100) || !safeText(b.first_name,100) || !safeText(b.birth_date,20) || !safeText(b.nationality,100) || !phone || !safeText(b.city,120) || !safeText(b.country,100))) return json({error:'Veuillez compléter toutes les informations personnelles obligatoires et accepter les conditions.'},400);
  if(role==='candidate' && !candidateIsAdult(b.birth_date)) return json({error:'Inscription refusée : GLOBAL EMPLOI est interdit aux demandeurs d’emploi de moins de 18 ans.',code:'CANDIDATE_MINIMUM_AGE_18'},403);
  if(role==='recruiter' && (!b.terms || !b.privacy || !safeText(b.last_name,100) || !safeText(b.first_name,100) || !safeText(b.job_title,150) || !phone || !safeText(b.country,100))) return json({error:'Veuillez compléter les informations obligatoires du recruteur et accepter les conditions et la politique de confidentialité.'},400);
  const exists=await env.JOB_DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first(); if(exists) return json({error:'Ce compte existe déjà.'},409);
  let userId=null;
  try{
    const p=await createPassword(password);
    const ins=await env.JOB_DB.prepare('INSERT INTO users(email,phone,password_hash,password_salt,role) VALUES(?,?,?,?,?)').bind(email,phone,p.hash,p.salt,role).run();
    userId=Number(ins?.meta?.last_row_id);
    if(!userId) throw new Error('User insert did not return last_row_id');
    await ensureMemberCodeSchema(env);
    await assignMemberCode(env,userId,role,nowISO());
    if(role==='candidate') { await ensureCandidateSchema(env); await env.JOB_DB.prepare('INSERT INTO candidate_profiles(user_id,first_name,last_name,gender,birth_date,nationality,marital_status,whatsapp,city,location,country,photo,job_alerts) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(userId,safeText(b.first_name,100),safeText(b.last_name,100),safeText(b.gender,20),safeText(b.birth_date,20),safeText(b.nationality,100),safeText(b.marital_status,80),safeText(b.whatsapp,40),safeText(b.city,120),safeText(b.location,180),safeText(b.country,100),safeText(b.photo,900000),b.job_alerts?1:0).run(); }
    else { await ensureRecruiterSchema(env); await env.JOB_DB.prepare('INSERT INTO recruiter_profiles(user_id,first_name,last_name,job_title,whatsapp,city,country,photo,marketing_alerts,verification_status) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(userId,safeText(b.first_name,100),safeText(b.last_name,100),safeText(b.job_title,150),safeText(b.whatsapp,40),safeText(b.city,120),safeText(b.country,100),safeText(b.photo,900000),b.marketing_alerts?1:0,'unverified').run(); }
    const expires='2099-12-31T23:59:59Z';
    await env.JOB_DB.prepare('INSERT INTO subscriptions(user_id,plan,started_at,expires_at,status) VALUES(?,?,?,?,?)').bind(userId,'free',nowISO(),expires,'active').run();
    const r=await env.JOB_DB.prepare('SELECT id,email,phone,member_code,role,status,session_version FROM users WHERE id=?').bind(userId).first();
    const token=await createSession(env,r); await audit(env,r.id,'REGISTER','user',r.id,{role});
    if(parsed.nativeForm){
      return new Response(null,{status:303,headers:{
        'location':'/#home',
        'set-cookie':sessionCookie(token),
        'cache-control':'no-store',
        'referrer-policy':'no-referrer',
        'x-content-type-options':'nosniff'
      }});
    }
    return json({ok:true,user:{id:r.id,email:r.email,role:r.role,member_code:r.member_code},subscription:await currentSubscription(env,r.id)},201,{'set-cookie':sessionCookie(token)});
  }catch(err){
    if(userId){ try{ await env.JOB_DB.prepare('DELETE FROM users WHERE id=?').bind(userId).run(); }catch{} }
    console.error('GLOBAL_EMPLOI_REGISTER_ERROR',{role,email,message:err?.message||String(err),stack:err?.stack});
    const e=new Error(err?.message||'Registration failed');
    e.code='REGISTRATION_FAILED';
    e.publicMessage='Échec de création du compte. Vérifiez la configuration Cloudflare et réessayez.';
    throw e;
  }
}


async function superAdminStatus(env){
  const configured=!!(env.SUPER_ADMIN_EMAIL && env.SUPER_ADMIN_PASSWORD && env.SUPER_ADMIN_RECOVERY_TOKEN);
  let exists=false, active=false;
  if(env.SUPER_ADMIN_EMAIL){
    const email=String(env.SUPER_ADMIN_EMAIL).trim().toLowerCase();
    const u=await env.JOB_DB.prepare("SELECT id,role,status FROM users WHERE lower(email)=? LIMIT 1").bind(email).first();
    exists=!!u && u.role==='super_admin';
    active=exists && u.status==='active';
  }
  return {configured,exists,active};
}
async function checkRecoveryRate(req,env,email){
  const ip=req.headers.get('CF-Connecting-IP')||'unknown';
  const key=`admin-recovery:${ip}:${String(email||'').toLowerCase()}`;
  const count=Number(await env.JOB_KV.get(key)||0);
  if(count>=5) return false;
  await env.JOB_KV.put(key,String(count+1),{expirationTtl:1800});
  return true;
}
async function handleSuperAdminRecover(req,env){
  const b=await req.json().catch(()=>({}));
  const email=safeText(b.email,190).toLowerCase();
  const recoveryToken=String(b.recovery_token||'');
  if(!env.SUPER_ADMIN_EMAIL || !env.SUPER_ADMIN_PASSWORD || !env.SUPER_ADMIN_RECOVERY_TOKEN){
    return json({error:'Récupération Super Admin non configurée. Ajoutez SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD et SUPER_ADMIN_RECOVERY_TOKEN dans les Secrets Cloudflare.'},503);
  }
  const expectedEmail=String(env.SUPER_ADMIN_EMAIL).trim().toLowerCase();
  if(!await checkRecoveryRate(req,env,email)) return json({error:'Trop de tentatives de récupération. Réessayez plus tard.'},429);
  if(email!==expectedEmail || !timingSafe(recoveryToken,String(env.SUPER_ADMIN_RECOVERY_TOKEN))){
    await new Promise(r=>setTimeout(r,250));
    return json({error:'Informations de récupération incorrectes.'},403);
  }

  const p=await createPassword(String(env.SUPER_ADMIN_PASSWORD));
  let u=await env.JOB_DB.prepare('SELECT * FROM users WHERE lower(email)=? LIMIT 1').bind(expectedEmail).first();
  let action='SUPER_ADMIN_RECOVERED';

  if(!u){
    u=await env.JOB_DB.prepare(`INSERT INTO users(email,password_hash,password_salt,role,status,session_version,created_at,updated_at)
      VALUES(?,?,?,'super_admin','active',1,?,?) RETURNING *`)
      .bind(expectedEmail,p.hash,p.salt,nowISO(),nowISO()).first();
    action='SUPER_ADMIN_INITIALIZED';
  }else{
    await env.JOB_DB.prepare(`UPDATE users SET email=?,password_hash=?,password_salt=?,role='super_admin',status='active',
      session_version=session_version+1,updated_at=? WHERE id=?`)
      .bind(expectedEmail,p.hash,p.salt,nowISO(),u.id).run();
    u=await env.JOB_DB.prepare('SELECT * FROM users WHERE id=?').bind(u.id).first();
  }

  // La hausse de session_version invalide toutes les anciennes sessions de ce compte.
  await audit(env,u.id,action,'user',u.id,{method:'cloudflare_recovery_secret'});
  try{
    const ip=req.headers.get('CF-Connecting-IP')||'unknown';
    await env.JOB_KV.delete(`admin-recovery:${ip}:${email}`);
  }catch{}
  return json({
    ok:true,
    status:'ready',
    message:'Compte Super Admin initialisé/récupéré. Connectez-vous maintenant avec SUPER_ADMIN_EMAIL et SUPER_ADMIN_PASSWORD configurés dans Cloudflare.'
  });
}
async function readLoginBody(req){
  const ct=String(req.headers.get('content-type')||'').toLowerCase();
  if(ct.includes('application/json')) return {body:await req.json().catch(()=>({})),nativeForm:false};
  if(ct.includes('application/x-www-form-urlencoded')||ct.includes('multipart/form-data')){
    const fd=await req.formData().catch(()=>null);
    return {body:fd?Object.fromEntries(fd):{},nativeForm:true};
  }
  return {body:{},nativeForm:false};
}
async function handleLogin(req,env){
  const parsed=await readLoginBody(req);
  const b=parsed.body;
  const email=safeText(b.email,190).toLowerCase(), password=String(b.password||'');
  if(!email||!password) return json({error:'E-mail et mot de passe obligatoires.'},400);
  if(!await checkRate(req,env,email)) return json({error:'Trop de tentatives. Réessayez plus tard.'},429);
  let u=await env.JOB_DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
  if(!u && env.SUPER_ADMIN_EMAIL && env.SUPER_ADMIN_PASSWORD && email===String(env.SUPER_ADMIN_EMAIL).toLowerCase() && timingSafe(password,String(env.SUPER_ADMIN_PASSWORD))){
    const p=await createPassword(password);
    u=await env.JOB_DB.prepare("INSERT INTO users(email,password_hash,password_salt,role,status) VALUES(?,?,?,'super_admin','active') RETURNING *").bind(email,p.hash,p.salt).first();
    await audit(env,u.id,'SUPER_ADMIN_INITIALIZED','user',u.id);
  }
  if(!u || u.status!=='active' || !(await verifyPassword(password,u.password_salt,u.password_hash))){ return json({error:'Identifiants incorrects.'},401); }
  await clearRate(req,env,email); await env.JOB_DB.prepare('UPDATE users SET last_login_at=? WHERE id=?').bind(nowISO(),u.id).run();
  const token=await createSession(env,u); await audit(env,u.id,'LOGIN','user',u.id);
  if(parsed.nativeForm){
    return new Response(null,{status:303,headers:{
      'location':'/#home',
      'set-cookie':sessionCookie(token),
      'cache-control':'no-store',
      'referrer-policy':'no-referrer',
      'x-content-type-options':'nosniff'
    }});
  }
  return json({ok:true,user:{id:u.id,email:u.email,role:u.role,member_code:u.member_code},subscription:await currentSubscription(env,u.id)},200,{'set-cookie':sessionCookie(token)});
}

async function api(req,env,url){
  const p=url.pathname, m=req.method;
  if(p.startsWith('/api/')) await ensureMemberCodeSchema(env);
  if(p==='/api/health'&&m==='GET'){
    assertBindings(env);
    await checkDatabase(env);
    await checkKV(env);
    const admin=await superAdminStatus(env);
    const linkage=await ensureDataLinkage(env);
    return json({ok:true,service:'GLOBAL EMPLOI',d1:'ok',kv:'ok',assets:'ok',linkage,super_admin:{configured:admin.configured,exists:admin.exists,active:admin.active}});
  }
  if(p==='/api/admin-recovery/status'&&m==='GET') return json(await superAdminStatus(env));
  if(p==='/api/admin-recovery/recover'&&m==='POST') return handleSuperAdminRecover(req,env);
  if(p==='/api/public-stats'&&m==='GET'){
    await expireJobs(env);
    const [jobs,recruiters,candidates,jobs30,recruiters30,candidates30]=await Promise.all([
      env.JOB_DB.prepare(`SELECT COUNT(*) n FROM jobs j JOIN users u ON u.id=j.recruiter_id
        WHERE j.status='published' AND u.status='active'`).first(),
      env.JOB_DB.prepare("SELECT COUNT(*) n FROM users WHERE role='recruiter' AND status='active'").first(),
      env.JOB_DB.prepare("SELECT COUNT(*) n FROM users WHERE role='candidate' AND status='active'").first(),
      env.JOB_DB.prepare(`SELECT COUNT(*) n FROM jobs WHERE datetime(created_at)>=datetime('now','-30 days')`).first(),
      env.JOB_DB.prepare("SELECT COUNT(*) n FROM users WHERE role='recruiter' AND datetime(created_at)>=datetime('now','-30 days')").first(),
      env.JOB_DB.prepare("SELECT COUNT(*) n FROM users WHERE role='candidate' AND datetime(created_at)>=datetime('now','-30 days')").first()
    ]);
    return json({
      jobs:Number(jobs?.n||0),companies:Number(recruiters?.n||0),candidates:Number(candidates?.n||0),
      movement:{jobs30:Number(jobs30?.n||0),companies30:Number(recruiters30?.n||0),candidates30:Number(candidates30?.n||0)}
    });
  }
  if(p==='/api/recruiter/health'&&m==='GET'){
    const s=await requireSession(req,env);
    if(s.user.role!=='recruiter') return json({error:'Réservé aux recruteurs.'},403);
    await ensureRecruiterSchema(env);
    await ensureCandidateSchema(env);
    await ensureRecruitmentSchema(env);
    await ensureRecruiterProSchema(env);
    await ensureAdminModuleSchema(env);
    const checks={profile:false,jobs:false,applications:false,messages:false,notifications:false,subscriptions:false};
    try{await env.JOB_DB.prepare('SELECT 1 FROM recruiter_profiles WHERE user_id=?').bind(s.user.id).first();checks.profile=true}catch{}
    try{await env.JOB_DB.prepare('SELECT COUNT(*) n FROM jobs WHERE recruiter_id=?').bind(s.user.id).first();checks.jobs=true}catch{}
    try{await env.JOB_DB.prepare('SELECT COUNT(*) n FROM applications a JOIN jobs j ON j.id=a.job_id WHERE j.recruiter_id=?').bind(s.user.id).first();checks.applications=true}catch{}
    try{await env.JOB_DB.prepare('SELECT COUNT(*) n FROM conversation_members WHERE user_id=?').bind(s.user.id).first();checks.messages=true}catch{}
    try{await env.JOB_DB.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=?').bind(s.user.id).first();checks.notifications=true}catch{}
    try{await env.JOB_DB.prepare('SELECT COUNT(*) n FROM subscriptions WHERE user_id=?').bind(s.user.id).first();checks.subscriptions=true}catch{}
    const ok=Object.values(checks).every(Boolean);
    return json({ok,service:'GLOBAL EMPLOI RECRUTEUR',checks});
  }
  if(p==='/api/data-linkage'&&m==='GET'){
    const s=await requireSession(req,env);
    const linkage=await ensureDataLinkage(env);
    let own={};
    if(s.user.role==='candidate'){
      own.profile=!!(await env.JOB_DB.prepare('SELECT 1 ok FROM candidate_profiles WHERE user_id=?').bind(s.user.id).first());
      own.applications=Number((await env.JOB_DB.prepare('SELECT COUNT(*) n FROM applications WHERE candidate_id=?').bind(s.user.id).first())?.n||0);
      own.recruitment_requests=Number((await env.JOB_DB.prepare('SELECT COUNT(*) n FROM recruitment_requests WHERE candidate_id=?').bind(s.user.id).first())?.n||0);
    }else if(s.user.role==='recruiter'){
      own.profile=!!(await env.JOB_DB.prepare('SELECT 1 ok FROM recruiter_profiles WHERE user_id=?').bind(s.user.id).first());
      own.jobs=Number((await env.JOB_DB.prepare('SELECT COUNT(*) n FROM jobs WHERE recruiter_id=?').bind(s.user.id).first())?.n||0);
      own.applications=Number((await env.JOB_DB.prepare('SELECT COUNT(*) n FROM applications a JOIN jobs j ON j.id=a.job_id WHERE j.recruiter_id=?').bind(s.user.id).first())?.n||0);
    }else{
      own.users=Number((await env.JOB_DB.prepare("SELECT COUNT(*) n FROM users WHERE role IN ('candidate','recruiter')").first())?.n||0);
      own.jobs=Number((await env.JOB_DB.prepare('SELECT COUNT(*) n FROM jobs').first())?.n||0);
      own.applications=Number((await env.JOB_DB.prepare('SELECT COUNT(*) n FROM applications').first())?.n||0);
    }
    return json({ok:true,user_id:s.user.id,role:s.user.role,linkage,own});
  }
  if(p==='/api/dashboard-metrics'&&m==='GET'){
    const s=await requireSession(req,env), uid=s.user.id, role=s.user.role;
    if(role==='candidate'){
      await ensureCandidateSchema(env); await ensureRecruitmentSchema(env);
      const [apps,offers,unread,docs]=await Promise.all([
        env.JOB_DB.prepare('SELECT COUNT(*) n FROM applications WHERE candidate_id=?').bind(uid).first(),
        env.JOB_DB.prepare('SELECT COUNT(*) n FROM recruitment_requests WHERE candidate_id=?').bind(uid).first(),
        env.JOB_DB.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND is_read=0').bind(uid).first(),
        env.JOB_DB.prepare('SELECT COUNT(*) n FROM candidate_documents WHERE user_id=?').bind(uid).first()
      ]);
      return json({role,applications:Number(apps?.n||0),recruitment_requests:Number(offers?.n||0),unread:Number(unread?.n||0),documents:Number(docs?.n||0)});
    }
    if(role==='recruiter'){
      await ensureRecruitmentSchema(env); await ensureRecruiterProSchema(env);
      const [jobs,visible,drafts,closed,apps,newApps,recruits,unread,views]=await Promise.all([
        env.JOB_DB.prepare('SELECT COUNT(*) n FROM jobs WHERE recruiter_id=?').bind(uid).first(),
        env.JOB_DB.prepare(`SELECT COUNT(*) n FROM jobs j WHERE j.recruiter_id=? AND j.status='published'`).bind(uid).first(),
        env.JOB_DB.prepare("SELECT COUNT(*) n FROM jobs WHERE recruiter_id=? AND status='draft'").bind(uid).first(),
        env.JOB_DB.prepare("SELECT COUNT(*) n FROM jobs WHERE recruiter_id=? AND status='closed'").bind(uid).first(),
        env.JOB_DB.prepare('SELECT COUNT(*) n FROM applications a JOIN jobs j ON j.id=a.job_id WHERE j.recruiter_id=?').bind(uid).first(),
        env.JOB_DB.prepare("SELECT COUNT(*) n FROM applications a JOIN jobs j ON j.id=a.job_id WHERE j.recruiter_id=? AND a.status='submitted'").bind(uid).first(),
        env.JOB_DB.prepare('SELECT COUNT(*) n FROM recruitment_requests WHERE recruiter_id=?').bind(uid).first(),
        env.JOB_DB.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND is_read=0').bind(uid).first(),
        env.JOB_DB.prepare('SELECT COALESCE(SUM(view_count),0) n FROM jobs WHERE recruiter_id=?').bind(uid).first()
      ]);
      return json({role,jobs:Number(jobs?.n||0),visible_jobs:Number(visible?.n||0),draft_jobs:Number(drafts?.n||0),closed_jobs:Number(closed?.n||0),
        applications:Number(apps?.n||0),new_applications:Number(newApps?.n||0),recruitment_requests:Number(recruits?.n||0),unread:Number(unread?.n||0),views:Number(views?.n||0)});
    }
    await ensureRecruiterSchema(env);
    const [users,candidates,recruiters,paid,free,pendingSubs,pendingVerify,jobs,applications,newUsers]=await Promise.all([
      env.JOB_DB.prepare("SELECT COUNT(*) n FROM users WHERE role!='super_admin'").first(),
      env.JOB_DB.prepare("SELECT COUNT(*) n FROM users WHERE role='candidate' AND status='active'").first(),
      env.JOB_DB.prepare("SELECT COUNT(*) n FROM users WHERE role='recruiter' AND status='active'").first(),
      env.JOB_DB.prepare(`SELECT COUNT(DISTINCT user_id) n FROM subscriptions WHERE plan IN ('standard','business') AND status='active' AND datetime(expires_at)>datetime('now')`).first(),
      env.JOB_DB.prepare(`SELECT COUNT(DISTINCT user_id) n FROM subscriptions WHERE plan='free' AND status='active' AND datetime(expires_at)>datetime('now')`).first(),
      env.JOB_DB.prepare("SELECT COUNT(*) n FROM subscription_requests WHERE status='pending'").first(),
      env.JOB_DB.prepare("SELECT COUNT(*) n FROM recruiter_profiles WHERE verification_status='pending'").first(),
      env.JOB_DB.prepare("SELECT COUNT(*) n FROM jobs").first(),
      env.JOB_DB.prepare("SELECT COUNT(*) n FROM applications").first(),
      env.JOB_DB.prepare("SELECT COUNT(*) n FROM users WHERE role!='super_admin' AND datetime(created_at)>=datetime('now','-30 days')").first()
    ]);
    return json({role,total_users:Number(users?.n||0),candidates:Number(candidates?.n||0),recruiters:Number(recruiters?.n||0),paid:Number(paid?.n||0),free:Number(free?.n||0),pending_subscriptions:Number(pendingSubs?.n||0),pending_verifications:Number(pendingVerify?.n||0),jobs:Number(jobs?.n||0),applications:Number(applications?.n||0),new_users_30d:Number(newUsers?.n||0)});
  }
  if(p==='/api/register'&&m==='POST') return handleRegister(req,env);
  if(p==='/api/login'&&m==='POST') return handleLogin(req,env);
  if(p==='/api/logout'&&m==='POST'){ const s=await getSession(req,env); if(s) await env.JOB_KV.delete(`sess:${s.token}`); return json({ok:true},200,{'set-cookie':clearCookie()}); }
  if(p==='/api/session'&&m==='GET'){ const s=await requireSession(req,env); return json({user:s.user,subscription:await currentSubscription(env,s.user.id)}); }
  if(p==='/api/change-password'&&m==='POST'){
    const s=await requireSession(req,env), b=await req.json(); const old=String(b.old_password||''), neu=String(b.new_password||''); if(neu.length<8) return json({error:'Le nouveau mot de passe doit contenir au moins 8 caractères.'},400);
    const u=await env.JOB_DB.prepare('SELECT password_hash,password_salt FROM users WHERE id=?').bind(s.user.id).first(); if(!await verifyPassword(old,u.password_salt,u.password_hash)) return json({error:'Mot de passe actuel incorrect.'},400);
    const ph=await createPassword(neu); await env.JOB_DB.prepare('UPDATE users SET password_hash=?,password_salt=?,session_version=session_version+1,updated_at=? WHERE id=?').bind(ph.hash,ph.salt,nowISO(),s.user.id).run(); await env.JOB_KV.delete(`sess:${s.token}`); await audit(env,s.user.id,'PASSWORD_CHANGED','user',s.user.id); return json({ok:true},200,{'set-cookie':clearCookie()});
  }
  if((p==='/api/profile'||p==='/api/load')&&m==='GET'){
    const s=await requireSession(req,env); const table=s.user.role==='recruiter'?'recruiter_profiles':'candidate_profiles'; if(s.user.role==='candidate') await ensureCandidateSchema(env); if(s.user.role==='recruiter') await ensureRecruiterSchema(env); const row=await env.JOB_DB.prepare(`SELECT * FROM ${table} WHERE user_id=?`).bind(s.user.id).first(); if(s.user.role==='candidate'){ const education=await env.JOB_DB.prepare('SELECT * FROM candidate_education WHERE user_id=? ORDER BY id').bind(s.user.id).all(); const experiences=await env.JOB_DB.prepare('SELECT * FROM candidate_experiences WHERE user_id=? ORDER BY id').bind(s.user.id).all(); const languages=await env.JOB_DB.prepare('SELECT * FROM candidate_languages WHERE user_id=? ORDER BY id').bind(s.user.id).all(); const documents=await env.JOB_DB.prepare('SELECT id,document_type,file_name,mime_type,size_bytes,created_at FROM candidate_documents WHERE user_id=? ORDER BY id DESC').bind(s.user.id).all(); return json({profile:row,education:education.results||[],experiences:experiences.results||[],languages:languages.results||[],documents:documents.results||[],completeness:await candidateCompleteness(env,s.user.id),subscription:await currentSubscription(env,s.user.id)}); } if(s.user.role==='recruiter'){ const documents=await env.JOB_DB.prepare('SELECT id,document_type,file_name,mime_type,size_bytes,created_at FROM recruiter_documents WHERE user_id=? ORDER BY id DESC').bind(s.user.id).all(); return json({profile:row,documents:documents.results||[],completeness:await recruiterCompleteness(env,s.user.id),subscription:await currentSubscription(env,s.user.id)}); } return json({profile:row,subscription:await currentSubscription(env,s.user.id)});
  }
  if((p==='/api/profile'||p==='/api/save')&&m==='POST'){
    const s=await requireSession(req,env), b=await req.json().catch(()=>({}));
    if(s.user.role==='candidate') { await ensureCandidateSchema(env); await env.JOB_DB.prepare(`UPDATE candidate_profiles SET first_name=?,last_name=?,gender=?,birth_date=?,nationality=?,marital_status=?,whatsapp=?,city=?,location=?,country=?,professional_title=?,activity_domain=?,profession=?,other_skills=?,experience_level=?,current_situation=?,description=?,skills=?,driving_license=?,driving_category=?,education_level=?,target_position=?,target_domain=?,desired_contracts=?,desired_city=?,mobility=?,availability=?,desired_salary=?,accepts_travel=?,job_alerts=?,updated_at=? WHERE user_id=?`).bind(safeText(b.first_name,100),safeText(b.last_name,100),safeText(b.gender,20),safeText(b.birth_date,20),safeText(b.nationality,100),safeText(b.marital_status,80),safeText(b.whatsapp,40),safeText(b.city,120),safeText(b.location,180),safeText(b.country,100),safeText(b.professional_title,180),safeText(b.activity_domain,180),safeText(b.profession,150),safeText(b.other_skills,1200),safeText(b.experience_level,80),safeText(b.current_situation,100),safeText(b.description,3000),safeText(b.skills,1800),b.driving_license?1:0,safeText(b.driving_category,50),safeText(b.education_level,80),safeText(b.target_position,180),safeText(b.target_domain,180),safeText(b.desired_contracts,500),safeText(b.desired_city,150),safeText(b.mobility,100),safeText(b.availability,100),b.desired_salary?Number(b.desired_salary):null,b.accepts_travel?1:0,b.job_alerts?1:0,nowISO(),s.user.id).run(); await env.JOB_DB.prepare('DELETE FROM candidate_education WHERE user_id=?').bind(s.user.id).run(); for(const x of parseList(b.education_items)) await env.JOB_DB.prepare('INSERT INTO candidate_education(user_id,diploma,specialty,institution,graduation_year) VALUES(?,?,?,?,?)').bind(s.user.id,safeText(x.diploma,150),safeText(x.specialty,180),safeText(x.institution,180),safeText(x.graduation_year,20)).run(); await env.JOB_DB.prepare('DELETE FROM candidate_experiences WHERE user_id=?').bind(s.user.id).run(); for(const x of parseList(b.experience_items)) await env.JOB_DB.prepare('INSERT INTO candidate_experiences(user_id,position,company,city_country,start_date,end_date,current_job,responsibilities) VALUES(?,?,?,?,?,?,?,?)').bind(s.user.id,safeText(x.position,180),safeText(x.company,180),safeText(x.city_country,180),safeText(x.start_date,20),safeText(x.end_date,20),x.current_job?1:0,safeText(x.responsibilities,2000)).run(); await env.JOB_DB.prepare('DELETE FROM candidate_languages WHERE user_id=?').bind(s.user.id).run(); for(const x of parseList(b.language_items)) if(x.language) await env.JOB_DB.prepare('INSERT INTO candidate_languages(user_id,language,level) VALUES(?,?,?)').bind(s.user.id,safeText(x.language,100),safeText(x.level,50)).run(); }
    else if(s.user.role==='recruiter') { await ensureRecruiterSchema(env); await env.JOB_DB.prepare(`UPDATE recruiter_profiles SET first_name=?,last_name=?,job_title=?,whatsapp=?,city=?,country=?,trade_name=?,company_name=?,organization_type=?,sector=?,main_domain=?,description=?,foundation_year=?,employee_count=?,company_country=?,company_city=?,district=?,address=?,website=?,social_page=?,logo=?,rccm=?,tax_id=?,cnps=?,desired_trades=?,recruitment_domains=?,annual_recruitment_count=?,contract_types=?,recruitment_zones=?,international_recruitment=?,marketing_alerts=?,updated_at=? WHERE user_id=?`).bind(safeText(b.first_name,100),safeText(b.last_name,100),safeText(b.job_title,150),safeText(b.whatsapp,40),safeText(b.city,120),safeText(b.country,100),safeText(b.trade_name,180),safeText(b.company_name,180),safeText(b.organization_type,100),safeText(b.sector,180),safeText(b.main_domain,180),safeText(b.description,3000),safeText(b.foundation_year,20),safeText(b.employee_count,80),safeText(b.company_country,100),safeText(b.company_city,120),safeText(b.district,180),safeText(b.address,250),safeText(b.website,250),safeText(b.social_page,250),safeText(b.logo,900000),safeText(b.rccm,120),safeText(b.tax_id,120),safeText(b.cnps,120),safeText(b.desired_trades,1800),safeText(b.recruitment_domains,1200),safeText(b.annual_recruitment_count,80),safeText(b.contract_types,500),safeText(b.recruitment_zones,1000),b.international_recruitment?1:0,b.marketing_alerts?1:0,nowISO(),s.user.id).run(); }
    else return json({error:'Profil non applicable.'},400); return json({ok:true});
  }
  if(p==='/api/subscription-request'&&m==='POST'){
    const s=await requireSession(req,env), b=await req.json(); const plan=b.plan==='business'?'business':'standard', amount=plan==='business'?10000:1000; const sub=await currentSubscription(env,s.user.id);
    if(sub && sub.plan!=='free' && sub.effective_status==='active'){
      return json({error:'Vous possédez déjà un abonnement payant actif. Une nouvelle demande d’activation sera disponible après son expiration.'},409);
    }
    const pending=await env.JOB_DB.prepare("SELECT id FROM subscription_requests WHERE user_id=? AND status='pending'").bind(s.user.id).first(); if(pending) return json({error:'Une demande est déjà en attente.'},409);
    const payer=safeText(b.payer_phone,40), tx=safeText(b.transaction_id,120); if(!payer||!tx) return json({error:'Téléphone et ID transaction obligatoires.'},400);
    await env.JOB_DB.prepare('INSERT INTO subscription_requests(user_id,plan,amount,payer_phone,transaction_id) VALUES(?,?,?,?,?)').bind(s.user.id,plan,amount,payer,tx).run(); await audit(env,s.user.id,'SUBSCRIPTION_REQUEST','subscription',null,{plan,amount}); return json({ok:true});
  }
  if(p==='/api/profile/preview'&&m==='GET'){
    const s=await requireSession(req,env);
    if(s.user.role==='candidate'){
      await ensureCandidateSchema(env);
      const c=await env.JOB_DB.prepare(`SELECT u.id,p.* FROM users u JOIN candidate_profiles p ON p.user_id=u.id WHERE u.id=?`).bind(s.user.id).first();
      const edu=await env.JOB_DB.prepare('SELECT diploma,specialty,institution,graduation_year FROM candidate_education WHERE user_id=? ORDER BY id DESC LIMIT 10').bind(s.user.id).all();
      const exp=await env.JOB_DB.prepare('SELECT position,company,city_country,start_date,end_date,current_job,responsibilities FROM candidate_experiences WHERE user_id=? ORDER BY id DESC LIMIT 10').bind(s.user.id).all();
      const langs=await env.JOB_DB.prepare('SELECT language,level FROM candidate_languages WHERE user_id=? ORDER BY id').bind(s.user.id).all();
      return json({candidate:c,education:edu.results||[],experiences:exp.results||[],languages:langs.results||[]});
    }
    return json({error:'Aperçu disponible pour les demandeurs d’emploi.'},403);
  }
  if(p==='/api/profile/completeness'&&m==='GET'){ const s=await requireSession(req,env); if(s.user.role!=='candidate') return json({percent:100,recommendations:[]}); return json(await candidateCompleteness(env,s.user.id)); }
  if(p==='/api/profile/documents'&&m==='POST'){ const s=await requireSession(req,env); if(s.user.role!=='candidate') return json({error:'Réservé aux demandeurs d’emploi.'},403); await ensureCandidateSchema(env); const fd=await req.formData(); const file=fd.get('file'); const type=safeText(fd.get('document_type'),40); if(!file||typeof file.arrayBuffer!=='function') return json({error:'Fichier requis.'},400); const allowed=['cv','motivation','diploma','work_certificate','identity']; if(!allowed.includes(type)) return json({error:'Type de document invalide.'},400); if(file.size>700*1024) return json({error:'Fichier trop volumineux. Maximum 700 Ko par document.'},413); const allowedMime=['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png']; if(!allowedMime.includes(file.type)) return json({error:'Format non autorisé.'},400); const buf=await file.arrayBuffer(); await env.JOB_DB.prepare('INSERT INTO candidate_documents(user_id,document_type,file_name,mime_type,size_bytes,content) VALUES(?,?,?,?,?,?)').bind(s.user.id,type,safeText(file.name,180),file.type,file.size,buf).run(); return json({ok:true,completeness:await candidateCompleteness(env,s.user.id)},201); }
  if(p.startsWith('/api/profile/documents/')&&m==='DELETE'){ const s=await requireSession(req,env); const id=Number(p.split('/').pop()); await env.JOB_DB.prepare('DELETE FROM candidate_documents WHERE id=? AND user_id=?').bind(id,s.user.id).run(); return json({ok:true}); }

  if(p==='/api/recruiter/documents'&&m==='POST'){
    const s=await requireSession(req,env); if(s.user.role!=='recruiter') return json({error:'Réservé aux recruteurs.'},403); await ensureRecruiterSchema(env);
    const fd=await req.formData(); const file=fd.get('file'); const type=safeText(fd.get('document_type'),40)||'official';
    if(!file||typeof file.arrayBuffer!=='function') return json({error:'Fichier requis.'},400);
    if(file.size>900*1024) return json({error:'Fichier trop volumineux. Maximum 900 Ko.'},413);
    const allowedMime=['application/pdf','image/jpeg','image/png','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if(!allowedMime.includes(file.type)) return json({error:'Format non autorisé.'},400);
    const buf=await file.arrayBuffer();
    await env.JOB_DB.prepare('INSERT INTO recruiter_documents(user_id,document_type,file_name,mime_type,size_bytes,content) VALUES(?,?,?,?,?,?)').bind(s.user.id,type,safeText(file.name,180),file.type,file.size,buf).run();
    return json({ok:true,completeness:await recruiterCompleteness(env,s.user.id)},201);
  }
  if(/^\/api\/recruiter\/documents\/\d+$/.test(p)&&m==='DELETE'){ const s=await requireSession(req,env); if(s.user.role!=='recruiter') return json({error:'Réservé aux recruteurs.'},403); const id=Number(p.split('/').pop()); await env.JOB_DB.prepare('DELETE FROM recruiter_documents WHERE id=? AND user_id=?').bind(id,s.user.id).run(); return json({ok:true}); }
  if(p==='/api/recruiter/verification/submit'&&m==='POST'){
    const s=await requireSession(req,env); if(s.user.role!=='recruiter') return json({error:'Réservé aux recruteurs.'},403); await ensureRecruiterSchema(env);
    const r=await env.JOB_DB.prepare('SELECT company_name,organization_type,sector,main_domain,company_country,company_city FROM recruiter_profiles WHERE user_id=?').bind(s.user.id).first();
    const d=await env.JOB_DB.prepare('SELECT COUNT(*) n FROM recruiter_documents WHERE user_id=?').bind(s.user.id).first();
    if(!r?.company_name||!r?.organization_type||!r?.sector||!r?.main_domain||!r?.company_country||!r?.company_city||!Number(d?.n)) return json({error:'Complétez les informations principales de l’entreprise et ajoutez au moins un document officiel avant de demander la vérification.'},400);
    await env.JOB_DB.prepare("UPDATE recruiter_profiles SET verification_status='pending',verification_note=NULL,company_info_verified=1,updated_at=? WHERE user_id=?").bind(nowISO(),s.user.id).run();
    await audit(env,s.user.id,'RECRUITER_VERIFICATION_SUBMITTED','recruiter',s.user.id);
    return json({ok:true,status:'pending'});
  }
  if(p==='/api/recruiter/jobs'&&m==='GET'){
    const s=await requireSession(req,env); if(s.user.role!=='recruiter') return json({error:'Réservé aux recruteurs.'},403);
    await ensureRecruiterProSchema(env);
    await expireJobs(env);
    const rows=await env.JOB_DB.prepare(`SELECT j.*,
      (SELECT COUNT(*) FROM applications a WHERE a.job_id=j.id) application_count,
      CASE WHEN j.status='published' THEN 1 ELSE 0 END public_visible
      FROM jobs j WHERE j.recruiter_id=? ORDER BY j.id DESC`).bind(s.user.id).all();
    return json({jobs:rows.results||[]});
  }
  if(p==='/api/recruiter/applications'&&m==='GET'){
    const s=await requireSession(req,env); if(s.user.role!=='recruiter') return json({error:'Réservé aux recruteurs.'},403);
    await ensureCandidateSchema(env); await ensureRecruiterProSchema(env);
    const rows=await env.JOB_DB.prepare(`SELECT a.id,a.status,a.message,a.created_at,j.id job_id,j.title,
      u.id candidate_id,u.email,u.phone,
      p.first_name,p.last_name,p.profession,p.professional_title,p.specialty,p.city,p.country,p.experience_level,p.experience_years,p.skills,p.description,p.availability,p.target_position,p.desired_contracts
      FROM applications a
      JOIN jobs j ON j.id=a.job_id
      JOIN users u ON u.id=a.candidate_id
      LEFT JOIN candidate_profiles p ON p.user_id=a.candidate_id
      WHERE j.recruiter_id=? AND a.status<>'withdrawn'
      ORDER BY a.id DESC`).bind(s.user.id).all();
    return json({applications:rows.results||[]});
  }
  if(p==='/api/jobs'&&m==='GET'){
    await ensureRecruiterProSchema(env);
    await expireJobs(env);
    const q=safeText(url.searchParams.get('q'),120).toLowerCase();
    const city=safeText(url.searchParams.get('city'),120).toLowerCase();
    const contract=safeText(url.searchParams.get('contract'),80).toLowerCase();
    const category=safeText(url.searchParams.get('category'),120).toLowerCase();
    const days=Math.max(0,Math.min(365,Number(url.searchParams.get('days')||0)));
    const page=Math.max(1,Number(url.searchParams.get('page')||1));
    const perPage=Math.max(4,Math.min(24,Number(url.searchParams.get('per_page')||12)));
    const offset=(page-1)*perPage;
    const likeQ=`%${q}%`,likeCity=`%${city}%`,likeContract=`%${contract}%`,likeCategory=`%${category}%`;
    const where=`j.status='published'
      AND u.role='recruiter' AND u.status='active'
      AND (?='' OR lower(j.title) LIKE ? OR lower(COALESCE(j.profession,'')) LIKE ? OR lower(COALESCE(j.category,'')) LIKE ? OR lower(COALESCE(j.skills_required,'')) LIKE ?)
      AND (?='' OR lower(COALESCE(j.location,'')) LIKE ?)
      AND (?='' OR lower(COALESCE(j.employment_type,'')) LIKE ?)
      AND (?='' OR lower(COALESCE(j.category,'')) LIKE ?)
      AND (?=0 OR datetime(j.created_at)>=datetime('now','-' || ? || ' days'))`;
    const binds=[q,likeQ,likeQ,likeQ,likeQ,city,likeCity,contract,likeContract,category,likeCategory,days,days];
    const totalRow=await env.JOB_DB.prepare(`SELECT COUNT(*) n FROM jobs j JOIN users u ON u.id=j.recruiter_id WHERE ${where}`).bind(...binds).first();
    const rows=await env.JOB_DB.prepare(`SELECT j.*,r.company_name,r.logo,r.company_city,
      COALESCE((SELECT s.plan FROM subscriptions s WHERE s.user_id=j.recruiter_id AND s.status='active' AND datetime(s.expires_at)>datetime('now') ORDER BY CASE s.plan WHEN 'business' THEN 3 WHEN 'standard' THEN 2 ELSE 1 END DESC, datetime(s.expires_at) DESC LIMIT 1),'free') plan
      FROM jobs j JOIN users u ON u.id=j.recruiter_id
      LEFT JOIN recruiter_profiles r ON r.user_id=j.recruiter_id
      WHERE ${where}
      ORDER BY j.id DESC LIMIT ? OFFSET ?`).bind(...binds,perPage,offset).all();
    const total=Number(totalRow?.n||0),pages=Math.max(1,Math.ceil(total/perPage));
    return json({jobs:rows.results||[],pagination:{page,per_page:perPage,total,pages,has_prev:page>1,has_next:page<pages}});
  }
  if(/^\/api\/jobs\/\d+$/.test(p)&&m==='GET'){
    const id=Number(p.split('/').pop());
    await ensureRecruiterProSchema(env);
    const j=await env.JOB_DB.prepare(`SELECT j.*,r.company_name,r.trade_name,r.sector,r.main_domain,r.description company_description,r.company_city,r.company_country,r.logo
      FROM jobs j
      JOIN users u ON u.id=j.recruiter_id AND u.role='recruiter' AND u.status='active'
      LEFT JOIN recruiter_profiles r ON r.user_id=j.recruiter_id
      WHERE j.id=? AND j.status='published'`).bind(id).first();
    if(!j) return json({error:'Offre introuvable ou non disponible.'},404);
    await env.JOB_DB.prepare('UPDATE jobs SET view_count=COALESCE(view_count,0)+1 WHERE id=?').bind(id).run();
    return json({job:j});
  }
  if(p==='/api/jobs'&&m==='POST'){
    const s=await requireSession(req,env); if(s.user.role!=='recruiter') return json({error:'Réservé aux recruteurs.'},403);
    await ensureRecruiterProSchema(env);
    await expireJobs(env);
    const b=await req.json(); if(!b.title||!b.description) return json({error:'Titre et description obligatoires.'},400);
    const status=b.status==='draft'?'draft':'published';
    const paid=await activePaidSubscription(env,s.user.id);
    if(!paid){
      const count=await env.JOB_DB.prepare("SELECT COUNT(*) n FROM jobs WHERE recruiter_id=? AND status IN ('published','draft','suspended')").bind(s.user.id).first();
      if(Number(count?.n||0)>=1) return json({error:'Compte FREE : une seule publication est autorisée. Supprimez, clôturez ou faites évoluer votre abonnement avant de publier une autre offre.'},403);
    }
    const closesAt=safeText(b.closes_at,40)||new Date(Date.now()+30*24*60*60*1000).toISOString();
    const r=await env.JOB_DB.prepare(`INSERT INTO jobs(
      recruiter_id,title,profession,category,description,employment_type,location,salary,vacancies,status,starts_at,closes_at,
      education_required,experience_required,skills_required,responsibilities,candidate_profile,work_schedule,availability_required
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`)
      .bind(s.user.id,safeText(b.title,180),safeText(b.profession,150),safeText(b.category,150),safeText(b.description,5000),
      safeText(b.employment_type,80),safeText(b.location,180),safeText(b.salary,120),Math.max(1,Number(b.vacancies||1)),status,
      safeText(b.starts_at,40),closesAt,safeText(b.education_required,180),safeText(b.experience_required,180),
      safeText(b.skills_required,2200),safeText(b.responsibilities,3000),safeText(b.candidate_profile,2500),
      safeText(b.work_schedule,500),safeText(b.availability_required,180)).first();
    await audit(env,s.user.id,'JOB_CREATED','job',r.id,{status,title:safeText(b.title,180)});
    return json({ok:true,id:r.id,status},201);
  }
  if(/^\/api\/jobs\/\d+\/apply$/.test(p)&&m==='POST'){
    const s=await requireSession(req,env);
    if(s.user.role!=='candidate') return json({error:'Le bouton « Je postule » est réservé aux demandeurs d’emploi.'},403);
    const paid=await activePaidSubscription(env,s.user.id);
    if(!paid) return json({error:'Votre compte peut consulter les offres, mais « Je postule » nécessite un abonnement STANDARD ou BUSINESS actif.'},403);
    const jobId=Number(p.split('/')[3]);
    const job=await env.JOB_DB.prepare(`SELECT j.id,j.recruiter_id,j.title FROM jobs j JOIN users u ON u.id=j.recruiter_id
      WHERE j.id=? AND j.status='published' AND u.status='active'`).bind(jobId).first();
    if(!job) return json({error:'Cette offre n’est plus disponible.'},404);
    const b=await req.json().catch(()=>({})),message=safeText(b.message,1200);
    const existing=await env.JOB_DB.prepare('SELECT id,status FROM applications WHERE job_id=? AND candidate_id=?').bind(jobId,s.user.id).first();
    if(existing){
      if(!['cancelled','withdrawn'].includes(existing.status)) return json({error:'Vous avez déjà une candidature active pour cette offre.'},409);
      await env.JOB_DB.batch([
        env.JOB_DB.prepare("UPDATE applications SET status='submitted',message=?,created_at=?,updated_at=? WHERE id=?").bind(message,nowISO(),nowISO(),existing.id),
        env.JOB_DB.prepare("INSERT INTO notifications(user_id,type,title,content) VALUES(?, 'application','Nouvelle candidature',?)").bind(job.recruiter_id,`Le candidat a postulé de nouveau à l’offre « ${safeText(job.title,120)} ».`)
      ]);
      await audit(env,s.user.id,'APPLICATION_RESUBMITTED','application',existing.id,{job_id:jobId});
      return json({ok:true,reapplied:true,id:existing.id},201);
    }
    await env.JOB_DB.batch([
      env.JOB_DB.prepare('INSERT INTO applications(job_id,candidate_id,message) VALUES(?,?,?)').bind(jobId,s.user.id,message),
      env.JOB_DB.prepare("INSERT INTO notifications(user_id,type,title,content) VALUES(?, 'application','Nouvelle candidature',?)").bind(job.recruiter_id,`Un candidat vient de postuler à l’offre « ${safeText(job.title,120)} ».`)
    ]);
    return json({ok:true},201);
  }
  if(p==='/api/candidates'&&m==='GET'){
    await ensureCandidateSchema(env);
    const q=safeText(url.searchParams.get('q'),120).toLowerCase();
    const city=safeText(url.searchParams.get('city'),120).toLowerCase();
    const experience=safeText(url.searchParams.get('experience'),120).toLowerCase();
    const availability=safeText(url.searchParams.get('availability'),120).toLowerCase();
    const education=safeText(url.searchParams.get('education'),120).toLowerCase();
    const page=Math.max(1,Number(url.searchParams.get('page')||1));
    const perPage=Math.max(4,Math.min(24,Number(url.searchParams.get('per_page')||12)));
    const offset=(page-1)*perPage;
    const likeQ=`%${q}%`,likeCity=`%${city}%`,likeExp=`%${experience}%`,likeAvail=`%${availability}%`,likeEdu=`%${education}%`;
    const where=`u.role='candidate' AND u.status='active'
      AND (?='' OR lower(COALESCE(p.profession,'')) LIKE ? OR lower(COALESCE(p.professional_title,'')) LIKE ? OR lower(COALESCE(p.specialty,'')) LIKE ? OR lower(COALESCE(p.skills,'')) LIKE ?)
      AND (?='' OR lower(COALESCE(p.city,'')) LIKE ?)
      AND (?='' OR lower(COALESCE(p.experience_level,'')) LIKE ? OR lower(COALESCE(p.experience_years,'')) LIKE ?)
      AND (?='' OR lower(COALESCE(p.availability,'')) LIKE ?)
      AND (?='' OR lower(COALESCE(p.education_level,'')) LIKE ? OR EXISTS(SELECT 1 FROM candidate_education ce WHERE ce.user_id=u.id AND lower(COALESCE(ce.diploma,'')) LIKE ?))`;
    const binds=[q,likeQ,likeQ,likeQ,likeQ,city,likeCity,experience,likeExp,likeExp,availability,likeAvail,education,likeEdu,likeEdu];
    const totalRow=await env.JOB_DB.prepare(`SELECT COUNT(*) n FROM users u JOIN candidate_profiles p ON p.user_id=u.id WHERE ${where}`).bind(...binds).first();
    const rows=await env.JOB_DB.prepare(`SELECT u.id,p.first_name,p.last_name,p.profession,p.professional_title,p.specialty,p.city,p.country,p.experience_level,p.experience_years,p.skills,p.availability,p.photo,p.target_position,p.education_level,
      COALESCE((SELECT s.plan FROM subscriptions s WHERE s.user_id=u.id AND s.status='active' AND datetime(s.expires_at)>datetime('now') ORDER BY CASE s.plan WHEN 'business' THEN 3 WHEN 'standard' THEN 2 ELSE 1 END DESC, datetime(s.expires_at) DESC LIMIT 1),'free') plan
      FROM users u JOIN candidate_profiles p ON p.user_id=u.id
      WHERE ${where}
      ORDER BY u.id DESC LIMIT ? OFFSET ?`).bind(...binds,perPage,offset).all();
    const total=Number(totalRow?.n||0),pages=Math.max(1,Math.ceil(total/perPage));
    return json({candidates:rows.results||[],pagination:{page,per_page:perPage,total,pages,has_prev:page>1,has_next:page<pages}});
  }
  if(/^\/api\/candidates\/\d+$/.test(p)&&m==='GET'){
    await ensureCandidateSchema(env);
    const id=Number(p.split('/').pop());
    const c=await env.JOB_DB.prepare(`SELECT u.id,p.first_name,p.last_name,p.profession,p.professional_title,p.activity_domain,p.specialty,p.other_skills,p.experience_level,p.experience_years,p.current_situation,p.skills,p.description,p.city,p.country,p.availability,p.target_position,p.target_domain,p.desired_contracts,p.desired_city,p.mobility,p.accepts_travel,p.photo
      FROM users u JOIN candidate_profiles p ON p.user_id=u.id
      WHERE u.id=? AND u.role='candidate' AND u.status='active'`).bind(id).first();
    if(!c) return json({error:'Profil candidat introuvable ou non disponible.'},404);
    const edu=await env.JOB_DB.prepare('SELECT diploma,specialty,institution,graduation_year FROM candidate_education WHERE user_id=? ORDER BY id DESC LIMIT 10').bind(id).all();
    const exp=await env.JOB_DB.prepare('SELECT position,company,city_country,start_date,end_date,current_job,responsibilities FROM candidate_experiences WHERE user_id=? ORDER BY id DESC LIMIT 10').bind(id).all();
    const langs=await env.JOB_DB.prepare('SELECT language,level FROM candidate_languages WHERE user_id=? ORDER BY id').bind(id).all();
    return json({candidate:c,education:edu.results||[],experiences:exp.results||[],languages:langs.results||[]});
  }
  if(/^\/api\/candidates\/\d+\/recruit$/.test(p)&&m==='POST'){
    const s=await requireSession(req,env);
    if(s.user.role!=='recruiter') return json({error:'Le bouton « Je recrute » est réservé aux recruteurs.'},403);
    const paid=await activePaidSubscription(env,s.user.id);
    if(!paid) return json({error:'Votre compte peut consulter les profils, mais « Je recrute » nécessite un abonnement STANDARD ou BUSINESS actif.'},403);
    await ensureRecruitmentSchema(env);
    const candidateId=Number(p.split('/')[3]);
    const cand=await env.JOB_DB.prepare("SELECT id FROM users WHERE id=? AND role='candidate' AND status='active'").bind(candidateId).first();
    if(!cand) return json({error:'Candidat introuvable.'},404);
    const b=await req.json().catch(()=>({})),message=safeText(b.message,1200);
    const existing=await env.JOB_DB.prepare('SELECT id,status FROM recruitment_requests WHERE recruiter_id=? AND candidate_id=?').bind(s.user.id,candidateId).first();
    if(existing){
      await ensureClientActionSchema(env);
      const hidden=await env.JOB_DB.prepare("SELECT COUNT(*) n FROM user_hidden_items WHERE item_type='recruitment_request' AND item_id=? AND user_id IN (?,?)").bind(existing.id,s.user.id,candidateId).first();
      if(existing.status!=='declined' && !Number(hidden?.n||0)) return json({error:'Vous avez déjà une proposition active pour ce candidat.'},409);
      await env.JOB_DB.batch([
        env.JOB_DB.prepare("UPDATE recruitment_requests SET status='sent',message=?,created_at=?,updated_at=? WHERE id=?").bind(message,nowISO(),nowISO(),existing.id),
        env.JOB_DB.prepare("DELETE FROM user_hidden_items WHERE item_type='recruitment_request' AND item_id=? AND user_id IN (?,?)").bind(existing.id,s.user.id,candidateId),
        env.JOB_DB.prepare("INSERT INTO notifications(user_id,type,title,content) VALUES(?, 'recruitment','Nouvelle proposition de recrutement','Un recruteur souhaite de nouveau entrer en contact avec vous pour une opportunité.')").bind(candidateId)
      ]);
      await audit(env,s.user.id,'RECRUITMENT_REQUEST_RESENT','recruitment_request',existing.id,{candidate_id:candidateId});
      return json({ok:true,resent:true,id:existing.id},201);
    }
    const created=await env.JOB_DB.prepare('INSERT INTO recruitment_requests(recruiter_id,candidate_id,message) VALUES(?,?,?) RETURNING id').bind(s.user.id,candidateId,message).first();
    await env.JOB_DB.prepare("INSERT INTO notifications(user_id,type,title,content) VALUES(?, 'recruitment','Nouvelle proposition de recrutement','Un recruteur souhaite entrer en contact avec vous pour une opportunité.')").bind(candidateId).run();
    return json({ok:true,id:created?.id},201);
  }
  if(p==='/api/recruiter/recruitment-requests'&&m==='GET'){
    const s=await requireSession(req,env); if(s.user.role!=='recruiter') return json({error:'Réservé aux recruteurs.'},403);
    await ensureRecruitmentSchema(env); const hiddenReady=await hasClientActionSchema(env);
    const rows=hiddenReady
      ? await env.JOB_DB.prepare(`SELECT rr.*,u.email,p.first_name,p.last_name,p.profession,p.professional_title
          FROM recruitment_requests rr JOIN users u ON u.id=rr.candidate_id LEFT JOIN candidate_profiles p ON p.user_id=rr.candidate_id
          WHERE rr.recruiter_id=? AND NOT EXISTS(SELECT 1 FROM user_hidden_items h WHERE h.user_id=? AND h.item_type='recruitment_request' AND h.item_id=rr.id)
          ORDER BY rr.updated_at DESC,rr.id DESC`).bind(s.user.id,s.user.id).all()
      : await env.JOB_DB.prepare(`SELECT rr.*,u.email,p.first_name,p.last_name,p.profession,p.professional_title
          FROM recruitment_requests rr JOIN users u ON u.id=rr.candidate_id LEFT JOIN candidate_profiles p ON p.user_id=rr.candidate_id
          WHERE rr.recruiter_id=? ORDER BY rr.updated_at DESC,rr.id DESC`).bind(s.user.id).all();
    return json({requests:rows.results||[]});
  }
  if(/^\/api\/recruiter\/recruitment-requests\/\d+$/.test(p)&&m==='DELETE'){
    const s=await requireSession(req,env); if(s.user.role!=='recruiter') return json({error:'Réservé aux recruteurs.'},403);
    await ensureClientActionSchema(env); const id=Number(p.split('/').pop());
    const row=await env.JOB_DB.prepare('SELECT id FROM recruitment_requests WHERE id=? AND recruiter_id=?').bind(id,s.user.id).first();
    if(!row) return json({error:'Proposition introuvable.'},404);
    await env.JOB_DB.prepare("INSERT OR IGNORE INTO user_hidden_items(user_id,item_type,item_id) VALUES(?,'recruitment_request',?)").bind(s.user.id,id).run();
    await audit(env,s.user.id,'RECRUITMENT_REQUEST_HIDDEN','recruitment_request',id,{side:'recruiter'});
    return json({ok:true});
  }
  if(p==='/api/candidate/recruitment-requests'&&m==='GET'){
    const s=await requireSession(req,env); if(s.user.role!=='candidate') return json({error:'Réservé aux demandeurs d’emploi.'},403);
    await ensureRecruitmentSchema(env);
    const hiddenReady=await hasClientActionSchema(env);
    const rows=hiddenReady
      ? await env.JOB_DB.prepare(`SELECT rr.*,r.company_name,r.trade_name,r.job_title,u.email
          FROM recruitment_requests rr JOIN users u ON u.id=rr.recruiter_id LEFT JOIN recruiter_profiles r ON r.user_id=rr.recruiter_id
          WHERE rr.candidate_id=? AND NOT EXISTS(SELECT 1 FROM user_hidden_items h WHERE h.user_id=? AND h.item_type='recruitment_request' AND h.item_id=rr.id)
          ORDER BY rr.id DESC`).bind(s.user.id,s.user.id).all()
      : await env.JOB_DB.prepare(`SELECT rr.*,r.company_name,r.trade_name,r.job_title,u.email
          FROM recruitment_requests rr JOIN users u ON u.id=rr.recruiter_id LEFT JOIN recruiter_profiles r ON r.user_id=rr.recruiter_id
          WHERE rr.candidate_id=? ORDER BY rr.id DESC`).bind(s.user.id).all();
    return json({requests:rows.results||[]});
  }
  if(/^\/api\/candidate\/recruitment-requests\/\d+$/.test(p)&&m==='DELETE'){
    const s=await requireSession(req,env); if(s.user.role!=='candidate') return json({error:'Réservé aux demandeurs d’emploi.'},403);
    await ensureClientActionSchema(env);
    const id=Number(p.split('/').pop());
    const row=await env.JOB_DB.prepare('SELECT id FROM recruitment_requests WHERE id=? AND candidate_id=?').bind(id,s.user.id).first();
    if(!row) return json({error:'Proposition introuvable.'},404);
    await env.JOB_DB.prepare("INSERT OR IGNORE INTO user_hidden_items(user_id,item_type,item_id) VALUES(?,'recruitment_request',?)").bind(s.user.id,id).run();
    await audit(env,s.user.id,'RECRUITMENT_REQUEST_HIDDEN','recruitment_request',id);
    return json({ok:true});
  }
  if(p==='/api/candidate/applications'&&m==='GET'){
    const s=await requireSession(req,env); if(s.user.role!=='candidate') return json({error:'Réservé aux demandeurs d’emploi.'},403);
    const rows=await env.JOB_DB.prepare(`SELECT a.id,a.status,a.message,a.created_at,a.updated_at,j.id job_id,j.title,j.location,j.employment_type,j.salary,r.company_name
      FROM applications a JOIN jobs j ON j.id=a.job_id LEFT JOIN recruiter_profiles r ON r.user_id=j.recruiter_id
      WHERE a.candidate_id=? AND a.status<>'withdrawn' ORDER BY a.id DESC`).bind(s.user.id).all();
    return json({applications:rows.results||[]});
  }
  if(/^\/api\/candidate\/applications\/\d+\/action$/.test(p)&&m==='POST'){
    const s=await requireSession(req,env); if(s.user.role!=='candidate') return json({error:'Réservé aux demandeurs d’emploi.'},403);
    const id=Number(p.split('/')[4]), b=await req.json().catch(()=>({})), action=safeText(b.action,30);
    const row=await env.JOB_DB.prepare(`SELECT a.id,a.status,j.recruiter_id,j.title FROM applications a JOIN jobs j ON j.id=a.job_id WHERE a.id=? AND a.candidate_id=?`).bind(id,s.user.id).first();
    if(!row) return json({error:'Candidature introuvable.'},404);
    if(action==='cancel'){
      if(row.status==='withdrawn') return json({error:'Cette candidature a déjà été retirée.'},409);
      if(row.status==='cancelled') return json({ok:true,status:'cancelled'});
      await env.JOB_DB.batch([
        env.JOB_DB.prepare("UPDATE applications SET status='cancelled',updated_at=? WHERE id=?").bind(nowISO(),id),
        env.JOB_DB.prepare("INSERT INTO notifications(user_id,type,title,content) VALUES(?,'application','Candidature annulée',?)").bind(row.recruiter_id,`Le candidat a annulé sa candidature pour « ${safeText(row.title,120)} ».`)
      ]);
      await audit(env,s.user.id,'APPLICATION_CANCELLED','application',id);
      return json({ok:true,status:'cancelled'});
    }
    if(action==='reactivate'){
      if(row.status!=='cancelled') return json({error:'Seule une candidature annulée peut être réactivée.'},409);
      await env.JOB_DB.batch([
        env.JOB_DB.prepare("UPDATE applications SET status='submitted',updated_at=? WHERE id=?").bind(nowISO(),id),
        env.JOB_DB.prepare("INSERT INTO notifications(user_id,type,title,content) VALUES(?,'application','Candidature réactivée',?)").bind(row.recruiter_id,`Le candidat a réactivé sa candidature pour « ${safeText(row.title,120)} ».`)
      ]);
      await audit(env,s.user.id,'APPLICATION_REACTIVATED','application',id);
      return json({ok:true,status:'submitted'});
    }
    if(action==='withdraw'){
      if(row.status!=='cancelled') return json({error:'Annulez d’abord la candidature avant de la retirer.'},409);
      await env.JOB_DB.batch([
        env.JOB_DB.prepare("UPDATE applications SET status='withdrawn',updated_at=? WHERE id=?").bind(nowISO(),id),
        env.JOB_DB.prepare("INSERT INTO notifications(user_id,type,title,content) VALUES(?,'application','Candidature retirée',?)").bind(row.recruiter_id,`Le candidat a retiré sa candidature pour « ${safeText(row.title,120)} ».`)
      ]);
      await audit(env,s.user.id,'APPLICATION_WITHDRAWN','application',id);
      return json({ok:true,status:'withdrawn'});
    }
    return json({error:'Action candidature invalide.'},400);
  }
  if(/^\/api\/recruiter\/applications\/\d+\/status$/.test(p)&&m==='POST'){
    const s=await requireSession(req,env); if(s.user.role!=='recruiter') return json({error:'Réservé aux recruteurs.'},403);
    const id=Number(p.split('/')[4]), b=await req.json().catch(()=>({}));
    const status=['submitted','reviewing','shortlisted','interview','accepted','rejected'].includes(b.status)?b.status:null;
    if(!status) return json({error:'Statut invalide.'},400);
    const row=await env.JOB_DB.prepare(`SELECT a.candidate_id,a.status current_status,j.title FROM applications a JOIN jobs j ON j.id=a.job_id WHERE a.id=? AND j.recruiter_id=?`).bind(id,s.user.id).first();
    if(!row) return json({error:'Candidature introuvable.'},404);
    if(['cancelled','withdrawn'].includes(row.current_status)) return json({error:'Cette candidature a été annulée ou retirée par le demandeur.'},409);
    await env.JOB_DB.batch([
      env.JOB_DB.prepare('UPDATE applications SET status=?,updated_at=? WHERE id=?').bind(status,nowISO(),id),
      env.JOB_DB.prepare("INSERT INTO notifications(user_id,type,title,content) VALUES(?,'application','Mise à jour candidature',?)").bind(row.candidate_id,`Votre candidature pour « ${safeText(row.title,120)} » est maintenant : ${status}.`)
    ]);
    return json({ok:true,status});
  }
  if(/^\/api\/candidate\/recruitment-requests\/\d+\/status$/.test(p)&&m==='POST'){
    const s=await requireSession(req,env); if(s.user.role!=='candidate') return json({error:'Réservé aux demandeurs d’emploi.'},403);
    await ensureRecruitmentSchema(env);
    const id=Number(p.split('/')[4]), b=await req.json().catch(()=>({}));
    const status=['sent','accepted','declined'].includes(b.status)?b.status:null;
    if(!status) return json({error:'Statut invalide.'},400);
    const row=await env.JOB_DB.prepare('SELECT recruiter_id FROM recruitment_requests WHERE id=? AND candidate_id=?').bind(id,s.user.id).first();
    if(!row) return json({error:'Proposition introuvable.'},404);
    await env.JOB_DB.batch([
      env.JOB_DB.prepare('UPDATE recruitment_requests SET status=?,updated_at=? WHERE id=?').bind(status,nowISO(),id),
      env.JOB_DB.prepare("INSERT INTO notifications(user_id,type,title,content) VALUES(?,'recruitment','Réponse du candidat',?)").bind(row.recruiter_id,`Le candidat a répondu à votre proposition : ${status}.`)
    ]);
    return json({ok:true,status});
  }
  if(/^\/api\/recruiter\/jobs\/\d+$/.test(p)&&m==='GET'){
    const s=await requireSession(req,env); if(s.user.role!=='recruiter') return json({error:'Réservé aux recruteurs.'},403);
    await ensureRecruiterProSchema(env);
    const id=Number(p.split('/').pop());
    const job=await env.JOB_DB.prepare('SELECT * FROM jobs WHERE id=? AND recruiter_id=?').bind(id,s.user.id).first();
    if(!job) return json({error:'Offre introuvable.'},404);
    const apps=await env.JOB_DB.prepare('SELECT COUNT(*) n FROM applications WHERE job_id=?').bind(id).first();
    return json({job,application_count:Number(apps?.n||0)});
  }
  if(/^\/api\/recruiter\/jobs\/\d+$/.test(p)&&m==='PATCH'){
    const s=await requireSession(req,env); if(s.user.role!=='recruiter') return json({error:'Réservé aux recruteurs.'},403);
    await ensureRecruiterProSchema(env);
    const id=Number(p.split('/').pop()),b=await req.json().catch(()=>({}));
    const owned=await env.JOB_DB.prepare('SELECT id FROM jobs WHERE id=? AND recruiter_id=?').bind(id,s.user.id).first();
    if(!owned) return json({error:'Offre introuvable.'},404);
    const status=['published','draft','suspended','closed','expired'].includes(b.status)?b.status:'draft';
    await env.JOB_DB.prepare(`UPDATE jobs SET title=?,profession=?,category=?,description=?,employment_type=?,location=?,salary=?,vacancies=?,status=?,starts_at=?,closes_at=?,
      education_required=?,experience_required=?,skills_required=?,responsibilities=?,candidate_profile=?,work_schedule=?,availability_required=?,updated_at=? WHERE id=? AND recruiter_id=?`)
      .bind(safeText(b.title,180),safeText(b.profession,150),safeText(b.category,150),safeText(b.description,5000),safeText(b.employment_type,80),
      safeText(b.location,180),safeText(b.salary,120),Math.max(1,Number(b.vacancies||1)),status,safeText(b.starts_at,40),safeText(b.closes_at,40),
      safeText(b.education_required,180),safeText(b.experience_required,180),safeText(b.skills_required,2200),safeText(b.responsibilities,3000),
      safeText(b.candidate_profile,2500),safeText(b.work_schedule,500),safeText(b.availability_required,180),nowISO(),id,s.user.id).run();
    await audit(env,s.user.id,'JOB_UPDATED','job',id,{status});
    return json({ok:true,status});
  }
  if(/^\/api\/recruiter\/jobs\/\d+\/renew$/.test(p)&&m==='POST'){
    const s=await requireSession(req,env); if(s.user.role!=='recruiter') return json({error:'Réservé aux recruteurs.'},403);
    await expireJobs(env);
    const id=Number(p.split('/')[4]);
    const row=await env.JOB_DB.prepare('SELECT id,status FROM jobs WHERE id=? AND recruiter_id=?').bind(id,s.user.id).first();
    if(!row) return json({error:'Offre introuvable.'},404);
    const closesAt=new Date(Date.now()+30*24*60*60*1000).toISOString();
    await env.JOB_DB.prepare("UPDATE jobs SET status='published',closes_at=?,updated_at=? WHERE id=? AND recruiter_id=?").bind(closesAt,nowISO(),id,s.user.id).run();
    await audit(env,s.user.id,'JOB_RENEWED','job',id,{closes_at:closesAt});
    return json({ok:true,closes_at:closesAt});
  }
  if(/^\/api\/recruiter\/jobs\/\d+\/duplicate$/.test(p)&&m==='POST'){
    const s=await requireSession(req,env); if(s.user.role!=='recruiter') return json({error:'Réservé aux recruteurs.'},403);
    await ensureRecruiterProSchema(env);
    const paid=await activePaidSubscription(env,s.user.id);
    if(!paid){
      const count=await env.JOB_DB.prepare("SELECT COUNT(*) n FROM jobs WHERE recruiter_id=? AND status IN ('published','draft','suspended')").bind(s.user.id).first();
      if(Number(count?.n||0)>=1) return json({error:'Compte FREE : une seule publication est autorisée. Supprimez, clôturez ou faites évoluer votre abonnement avant de dupliquer une offre.'},403);
    }
    const id=Number(p.split('/')[4]);
    const j=await env.JOB_DB.prepare('SELECT * FROM jobs WHERE id=? AND recruiter_id=?').bind(id,s.user.id).first();
    if(!j) return json({error:'Offre introuvable.'},404);
    const closesAt=j.closes_at||new Date(Date.now()+30*24*60*60*1000).toISOString();
    const r=await env.JOB_DB.prepare(`INSERT INTO jobs(recruiter_id,title,profession,category,description,employment_type,location,salary,vacancies,status,starts_at,closes_at,
      education_required,experience_required,skills_required,responsibilities,candidate_profile,work_schedule,availability_required)
      VALUES(?,?,?,?,?,?,?,?,?,'draft',?,?,?,?,?,?,?,?,?) RETURNING id`)
      .bind(s.user.id,`${safeText(j.title,165)} (copie)`,j.profession,j.category,j.description,j.employment_type,j.location,j.salary,j.vacancies,
      j.starts_at,closesAt,j.education_required,j.experience_required,j.skills_required,j.responsibilities,j.candidate_profile,j.work_schedule,j.availability_required).first();
    await audit(env,s.user.id,'JOB_DUPLICATED','job',r.id,{source_id:id});
    return json({ok:true,id:r.id},201);
  }
  if(/^\/api\/recruiter\/jobs\/\d+\/status$/.test(p)&&m==='POST'){
    const s=await requireSession(req,env); if(s.user.role!=='recruiter') return json({error:'Réservé aux recruteurs.'},403);
    const id=Number(p.split('/')[4]), b=await req.json().catch(()=>({}));
    const status=['published','draft','suspended','closed','expired'].includes(b.status)?b.status:null;
    if(!status) return json({error:'Statut invalide.'},400);
    const r=await env.JOB_DB.prepare('UPDATE jobs SET status=?,updated_at=? WHERE id=? AND recruiter_id=?').bind(status,nowISO(),id,s.user.id).run();
    return json({ok:true,status,changed:r.meta?.changes||0});
  }
  if(/^\/api\/recruiter\/jobs\/\d+$/.test(p)&&m==='DELETE'){
    const s=await requireSession(req,env); if(s.user.role!=='recruiter') return json({error:'Réservé aux recruteurs.'},403);
    const id=Number(p.split('/').pop());
    await env.JOB_DB.prepare('DELETE FROM jobs WHERE id=? AND recruiter_id=?').bind(id,s.user.id).run();
    return json({ok:true});
  }
  if(p==='/api/subscription-history'&&m==='GET'){
    const s=await requireSession(req,env);
    if(s.user.role==='super_admin') return json({subscriptions:[],requests:[]});
    const [subs,reqs]=await Promise.all([
      env.JOB_DB.prepare('SELECT id,plan,started_at,expires_at,status,created_at FROM subscriptions WHERE user_id=? ORDER BY id DESC LIMIT 50').bind(s.user.id).all(),
      env.JOB_DB.prepare('SELECT id,plan,amount,payer_phone,transaction_id,status,admin_note,created_at,processed_at FROM subscription_requests WHERE user_id=? ORDER BY id DESC LIMIT 50').bind(s.user.id).all()
    ]);
    return json({subscriptions:subs.results||[],requests:reqs.results||[]});
  }
  if(p==='/api/notifications/read-all'&&m==='POST'){
    const s=await requireSession(req,env);
    await env.JOB_DB.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').bind(s.user.id).run();
    return json({ok:true});
  }
  if(/^\/api\/notifications\/\d+\/read$/.test(p)&&m==='POST'){
    const s=await requireSession(req,env),id=Number(p.split('/')[3]);
    const r=await env.JOB_DB.prepare('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?').bind(id,s.user.id).run();
    if(!Number(r?.meta?.changes||0)) return json({error:'Notification introuvable.'},404);
    return json({ok:true});
  }
  if(/^\/api\/notifications\/\d+$/.test(p)&&m==='DELETE'){
    const s=await requireSession(req,env),id=Number(p.split('/').pop()); await ensureClientActionSchema(env);
    const row=await env.JOB_DB.prepare('SELECT id FROM notifications WHERE id=? AND user_id=?').bind(id,s.user.id).first();
    if(!row) return json({error:'Notification introuvable.'},404);
    await env.JOB_DB.prepare("INSERT OR IGNORE INTO user_hidden_items(user_id,item_type,item_id) VALUES(?,'notification',?)").bind(s.user.id,id).run();
    await audit(env,s.user.id,'NOTIFICATION_HIDDEN','notification',id);
    return json({ok:true});
  }
  if(p==='/api/messages'&&m==='GET'){
    const s=await requireSession(req,env); const cid=Number(url.searchParams.get('conversation_id')); const member=await env.JOB_DB.prepare('SELECT 1 FROM conversation_members WHERE conversation_id=? AND user_id=?').bind(cid,s.user.id).first(); if(!member) return json({error:'Accès interdit.'},403);
    await env.JOB_DB.prepare('UPDATE messages SET read_at=COALESCE(read_at,?) WHERE conversation_id=? AND sender_id<>?').bind(nowISO(),cid,s.user.id).run();
    const hiddenReady=await hasClientActionSchema(env);
    const rows=hiddenReady
      ? await env.JOB_DB.prepare(`SELECT id,sender_id,content,read_at,created_at FROM messages m WHERE conversation_id=? AND NOT EXISTS(SELECT 1 FROM user_hidden_items h WHERE h.user_id=? AND h.item_type='message' AND h.item_id=m.id) ORDER BY id ASC LIMIT 300`).bind(cid,s.user.id).all()
      : await env.JOB_DB.prepare('SELECT id,sender_id,content,read_at,created_at FROM messages WHERE conversation_id=? ORDER BY id ASC LIMIT 300').bind(cid).all();
    return json({messages:rows.results||[]});
  }
  if(/^\/api\/messages\/\d+$/.test(p)&&m==='DELETE'){
    const s=await requireSession(req,env); await ensureClientActionSchema(env); const id=Number(p.split('/').pop());
    const row=await env.JOB_DB.prepare(`SELECT m.id,m.sender_id,m.conversation_id FROM messages m JOIN conversation_members cm ON cm.conversation_id=m.conversation_id AND cm.user_id=? WHERE m.id=?`).bind(s.user.id,id).first();
    if(!row) return json({error:'Message introuvable.'},404);
    await env.JOB_DB.prepare("INSERT OR IGNORE INTO user_hidden_items(user_id,item_type,item_id) VALUES(?,'message',?)").bind(s.user.id,id).run();
    await audit(env,s.user.id,'MESSAGE_HIDDEN','message',id);
    return json({ok:true});
  }
  if(p==='/api/messages'&&m==='POST'){
    const s=await requireSession(req,env), b=await req.json(); const receiver=Number(b.receiver_id), content=safeText(b.content,2500); if(!receiver||!content||receiver===s.user.id) return json({error:'Message invalide.'},400);
    const c=await env.JOB_DB.prepare(`SELECT cm1.conversation_id id FROM conversation_members cm1 JOIN conversation_members cm2 ON cm1.conversation_id=cm2.conversation_id WHERE cm1.user_id=? AND cm2.user_id=? LIMIT 1`).bind(s.user.id,receiver).first(); let cid=c?.id;
    if(!cid){ const cr=await env.JOB_DB.prepare('INSERT INTO conversations DEFAULT VALUES RETURNING id').first(); cid=cr.id; await env.JOB_DB.batch([env.JOB_DB.prepare('INSERT INTO conversation_members(conversation_id,user_id) VALUES(?,?)').bind(cid,s.user.id),env.JOB_DB.prepare('INSERT INTO conversation_members(conversation_id,user_id) VALUES(?,?)').bind(cid,receiver)]); }
    await ensureClientActionSchema(env);
    await env.JOB_DB.batch([
      env.JOB_DB.prepare('INSERT INTO messages(conversation_id,sender_id,content) VALUES(?,?,?)').bind(cid,s.user.id,content),
      env.JOB_DB.prepare("DELETE FROM user_hidden_items WHERE item_type='conversation' AND item_id=? AND user_id IN (?,?)").bind(cid,s.user.id,receiver),
      env.JOB_DB.prepare("INSERT INTO notifications(user_id,type,title,content) VALUES(?, 'message','Nouveau message','Vous avez reçu un nouveau message.')").bind(receiver)
    ]); return json({ok:true,conversation_id:cid},201);
  }
  if(p==='/api/conversations'&&m==='GET'){
    const s=await requireSession(req,env); const hiddenReady=await hasClientActionSchema(env);
    const rows=hiddenReady
      ? await env.JOB_DB.prepare(`SELECT c.id,c.updated_at,
          (SELECT content FROM messages m WHERE m.conversation_id=c.id AND NOT EXISTS(SELECT 1 FROM user_hidden_items h WHERE h.user_id=? AND h.item_type='message' AND h.item_id=m.id) ORDER BY m.id DESC LIMIT 1) last_message,
          ou.id other_user_id,ou.email other_email,ou.role other_role,
          COALESCE(cp.first_name||' '||cp.last_name,rp.company_name,ou.email) other_name
          FROM conversations c
          JOIN conversation_members me ON me.conversation_id=c.id AND me.user_id=?
          JOIN conversation_members other ON other.conversation_id=c.id AND other.user_id<>?
          JOIN users ou ON ou.id=other.user_id
          LEFT JOIN candidate_profiles cp ON cp.user_id=ou.id
          LEFT JOIN recruiter_profiles rp ON rp.user_id=ou.id
          WHERE NOT EXISTS(SELECT 1 FROM user_hidden_items hc WHERE hc.user_id=? AND hc.item_type='conversation' AND hc.item_id=c.id)
          ORDER BY c.updated_at DESC`).bind(s.user.id,s.user.id,s.user.id,s.user.id).all()
      : await env.JOB_DB.prepare(`SELECT c.id,c.updated_at,
          (SELECT content FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) last_message,
          ou.id other_user_id,ou.email other_email,ou.role other_role,
          COALESCE(cp.first_name||' '||cp.last_name,rp.company_name,ou.email) other_name
          FROM conversations c
          JOIN conversation_members me ON me.conversation_id=c.id AND me.user_id=?
          JOIN conversation_members other ON other.conversation_id=c.id AND other.user_id<>?
          JOIN users ou ON ou.id=other.user_id
          LEFT JOIN candidate_profiles cp ON cp.user_id=ou.id
          LEFT JOIN recruiter_profiles rp ON rp.user_id=ou.id
          ORDER BY c.updated_at DESC`).bind(s.user.id,s.user.id).all();
    return json({conversations:rows.results||[]});
  }
  if(/^\/api\/conversations\/\d+$/.test(p)&&m==='DELETE'){
    const s=await requireSession(req,env); await ensureClientActionSchema(env); const id=Number(p.split('/').pop());
    const member=await env.JOB_DB.prepare('SELECT 1 FROM conversation_members WHERE conversation_id=? AND user_id=?').bind(id,s.user.id).first();
    if(!member) return json({error:'Conversation introuvable.'},404);
    await env.JOB_DB.prepare("INSERT OR IGNORE INTO user_hidden_items(user_id,item_type,item_id) VALUES(?,'conversation',?)").bind(s.user.id,id).run();
    await audit(env,s.user.id,'CONVERSATION_HIDDEN','conversation',id);
    return json({ok:true});
  }

  if(p==='/api/notifications'&&m==='GET'){ const s=await requireSession(req,env); const hiddenReady=await hasClientActionSchema(env); const rows=hiddenReady?await env.JOB_DB.prepare(`SELECT * FROM notifications n WHERE user_id=? AND NOT EXISTS(SELECT 1 FROM user_hidden_items h WHERE h.user_id=? AND h.item_type='notification' AND h.item_id=n.id) ORDER BY n.id DESC LIMIT 100`).bind(s.user.id,s.user.id).all():await env.JOB_DB.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100').bind(s.user.id).all(); return json({notifications:rows.results||[]}); }

  if(p==='/api/admin/subscription-requests'&&m==='GET'){ await requireAdmin(req,env); await ensureAdminDataReady(env); const rows=await env.JOB_DB.prepare(`SELECT sr.*,COALESCE(u.email,'Compte supprimé #'||sr.user_id) email,COALESCE(u.role,'unknown') role FROM subscription_requests sr LEFT JOIN users u ON u.id=sr.user_id WHERE sr.status='pending' ORDER BY sr.id DESC`).all(); return json({requests:rows.results||[]}); }
  if(/^\/api\/admin\/subscription-requests\/\d+\/(approve|reject)$/.test(p)&&m==='POST'){
    const s=await requireAdmin(req,env), parts=p.split('/'), id=Number(parts[4]), action=parts[5]; const r=await env.JOB_DB.prepare("SELECT * FROM subscription_requests WHERE id=? AND status='pending'").bind(id).first(); if(!r) return json({error:'Demande introuvable.'},404);
    if(action==='approve'){
      const days=r.plan==='business'?365:30; await env.JOB_DB.batch([
        env.JOB_DB.prepare("UPDATE subscriptions SET status='expired',updated_at=? WHERE user_id=? AND status='active'").bind(nowISO(),r.user_id),
        env.JOB_DB.prepare("INSERT INTO subscriptions(user_id,plan,started_at,expires_at,status) VALUES(?,?,?,?, 'active')").bind(r.user_id,r.plan,nowISO(),addDays(days)),
        env.JOB_DB.prepare("UPDATE subscription_requests SET status='approved',admin_id=?,processed_at=? WHERE id=?").bind(s.user.id,nowISO(),id),
        env.JOB_DB.prepare("UPDATE users SET status='active',updated_at=? WHERE id=? AND role IN ('candidate','recruiter')").bind(nowISO(),r.user_id),
        env.JOB_DB.prepare("INSERT INTO notifications(user_id,type,title,content) VALUES(?, 'subscription','Abonnement activé','Votre abonnement GLOBAL EMPLOI a été activé avec succès.')").bind(r.user_id)
      ]); await audit(env,s.user.id,'SUBSCRIPTION_APPROVED','subscription_request',id,{user_id:r.user_id,plan:r.plan});
    } else {
      await env.JOB_DB.batch([
        env.JOB_DB.prepare("UPDATE subscription_requests SET status='rejected',admin_id=?,processed_at=?,admin_note='Paiement non trouvé' WHERE id=?").bind(s.user.id,nowISO(),id),
        env.JOB_DB.prepare("INSERT INTO notifications(user_id,type,title,content) VALUES(?, 'subscription','Paiement non trouvé','Nous n’avons pas pu identifier le paiement transmis. Vérifiez le numéro et l’ID de transaction.')").bind(r.user_id)
      ]); await audit(env,s.user.id,'SUBSCRIPTION_REJECTED','subscription_request',id,{user_id:r.user_id});
    }
    return json({ok:true});
  }
  if(p==='/api/admin/recruiter-verifications'&&m==='GET'){ await requireAdmin(req,env); await ensureRecruiterSchema(env); const rows=await env.JOB_DB.prepare(`SELECT r.user_id,r.first_name,r.last_name,r.job_title,r.company_name,r.organization_type,r.sector,r.company_city,r.verification_status,r.verification_note,u.email,u.phone FROM recruiter_profiles r JOIN users u ON u.id=r.user_id WHERE r.verification_status='pending' ORDER BY r.updated_at DESC`).all(); return json({recruiters:rows.results||[]}); }
  if(/^\/api\/admin\/recruiters\/\d+\/(verify|reject)$/.test(p)&&m==='POST'){ const s=await requireAdmin(req,env), parts=p.split('/'), userId=Number(parts[4]), action=parts[5]; await ensureRecruiterSchema(env); const b=await req.json().catch(()=>({})); const status=action==='verify'?'verified':'unverified'; await env.JOB_DB.prepare('UPDATE recruiter_profiles SET verification_status=?,verification_note=?,email_verified=?,phone_verified=?,company_info_verified=?,official_document_verified=?,updated_at=? WHERE user_id=?').bind(status,action==='verify'?null:safeText(b.note,500)||'Vérification refusée',action==='verify'?1:0,action==='verify'?1:0,action==='verify'?1:0,action==='verify'?1:0,nowISO(),userId).run(); await env.JOB_DB.prepare("INSERT INTO notifications(user_id,type,title,content) VALUES(?, 'verification', ?, ?)").bind(userId,action==='verify'?'Entreprise vérifiée':'Vérification à compléter',action==='verify'?'Votre compte recruteur GLOBAL EMPLOI est maintenant vérifié.':'Votre demande de vérification nécessite des corrections. Consultez votre profil entreprise.').run(); await audit(env,s.user.id,action==='verify'?'RECRUITER_VERIFIED':'RECRUITER_VERIFICATION_REJECTED','recruiter',userId); return json({ok:true,status}); }
  if(p==='/api/account/logout-all'&&m==='POST'){
    const s=await requireSession(req,env);
    await env.JOB_DB.prepare('UPDATE users SET session_version=session_version+1,updated_at=? WHERE id=?').bind(nowISO(),s.user.id).run();
    await audit(env,s.user.id,'USER_LOGOUT_ALL','user',s.user.id);
    return json({ok:true},200,{'set-cookie':clearCookie()});
  }
  if(p==='/api/account/delete-request'&&m==='POST'){
    const s=await requireSession(req,env); await ensureAdminModuleSchema(env);
    if(s.user.role==='super_admin') return json({error:'Le compte Super Admin ne peut pas utiliser cette demande.'},400);
    const existing=await env.JOB_DB.prepare("SELECT id FROM support_messages WHERE sender_user_id=? AND category='account_deletion' AND status IN ('unread','read') ORDER BY id DESC LIMIT 1").bind(s.user.id).first();
    if(existing) return json({error:'Une demande de suppression de compte est déjà en cours de traitement.'},409);
    const subject='Demande de suppression définitive du compte';
    const content=`Le membre ${s.user.email} (${s.user.role}) demande la suppression définitive de son compte GLOBAL EMPLOI. La suppression doit être décidée et exécutée par le Super Admin après vérification.`;
    const r=await env.JOB_DB.prepare("INSERT INTO support_messages(sender_user_id,recipient_user_id,subject,content,category,status) VALUES(?,NULL,?,?, 'account_deletion','unread') RETURNING id").bind(s.user.id,subject,content).first();
    await audit(env,s.user.id,'ACCOUNT_DELETE_REQUEST','support_message',r?.id||null,{role:s.user.role});
    return json({ok:true,request_id:r?.id||null},201);
  }
  if(p==='/api/account'&&m==='DELETE'){
    return json({error:'La suppression directe par le client est désactivée. Envoyez une demande au support GLOBAL EMPLOI.'},403);
  }
  if(/^\/api\/admin\/users\/\d+$/.test(p)&&m==='DELETE'){
    const s=await requireAdmin(req,env);
    const userId=Number(p.split('/').pop());
    if(userId===s.user.id) return json({error:'Le Super Admin connecté ne peut pas supprimer son propre compte depuis cette action.'},400);
    const target=await env.JOB_DB.prepare('SELECT id,role FROM users WHERE id=?').bind(userId).first();
    if(!target) return json({error:'Compte introuvable.'},404);
    await audit(env,s.user.id,'USER_DELETE','user',userId,{role:target.role});
    await deleteUserAndRelatedData(env,userId);
    return json({ok:true});
  }
  if(p==='/api/admin/jobs'&&m==='GET'){
    await requireAdmin(req,env); await ensureAdminDataReady(env);
    const rows=await env.JOB_DB.prepare(`SELECT j.*,COALESCE(u.email,'Compte #'||j.recruiter_id) recruiter_email,r.company_name,
      COALESCE(u.status,'deleted') recruiter_status,
      (SELECT COUNT(*) FROM applications a WHERE a.job_id=j.id) application_count
      FROM jobs j LEFT JOIN users u ON u.id=j.recruiter_id LEFT JOIN recruiter_profiles r ON r.user_id=j.recruiter_id
      ORDER BY j.id DESC`).all();
    return json({jobs:rows.results||[]});
  }
  if(/^\/api\/admin\/jobs\/\d+$/.test(p)&&m==='DELETE'){
    const s=await requireAdmin(req,env),id=Number(p.split('/').pop());
    await audit(env,s.user.id,'ADMIN_JOB_DELETE','job',id);
    await env.JOB_DB.prepare('DELETE FROM jobs WHERE id=?').bind(id).run();
    return json({ok:true});
  }
  if(p==='/api/admin/applications'&&m==='GET'){
    await requireAdmin(req,env); await ensureAdminDataReady(env);
    const rows=await env.JOB_DB.prepare(`SELECT a.id,a.job_id,a.candidate_id,a.status,a.created_at,COALESCE(j.title,'Offre #'||a.job_id) title,
      COALESCE(cu.email,'Compte #'||a.candidate_id) candidate_email,COALESCE(ru.email,'Compte recruteur') recruiter_email,r.company_name
      FROM applications a LEFT JOIN jobs j ON j.id=a.job_id
      LEFT JOIN users cu ON cu.id=a.candidate_id LEFT JOIN users ru ON ru.id=j.recruiter_id
      LEFT JOIN recruiter_profiles r ON r.user_id=ru.id ORDER BY a.id DESC`).all();
    return json({applications:rows.results||[]});
  }
  if(p==='/api/admin/audit-logs'&&m==='GET'){
    await requireAdmin(req,env); await ensureAdminDataReady(env);
    const rows=await env.JOB_DB.prepare(`SELECT a.*,COALESCE(u.email,CASE WHEN a.actor_user_id IS NULL THEN 'Système' ELSE 'Compte #'||a.actor_user_id END) actor_email FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.id DESC`).all();
    return json({logs:rows.results||[]});
  }
  if(p==='/api/admin/subscription-history'&&m==='GET'){
    await requireAdmin(req,env);
    const rows=await env.JOB_DB.prepare(`SELECT s.*,u.email,u.role FROM subscriptions s JOIN users u ON u.id=s.user_id ORDER BY s.id DESC`).all();
    return json({subscriptions:rows.results||[]});
  }
  if(/^\/api\/admin\/users\/\d+\/status$/.test(p)&&m==='POST'){
    const s=await requireAdmin(req,env),id=Number(p.split('/')[4]),b=await req.json().catch(()=>({}));
    const status=['active','suspended','disabled'].includes(b.status)?b.status:null;
    if(!status) return json({error:'Statut invalide.'},400);
    const target=await env.JOB_DB.prepare('SELECT role FROM users WHERE id=?').bind(id).first();
    if(!target) return json({error:'Compte introuvable.'},404);
    if(target.role==='super_admin') return json({error:'Le compte Super Admin principal reste actif sans limite et ne peut pas être suspendu ici.'},403);
    await env.JOB_DB.prepare('UPDATE users SET status=?,session_version=session_version+1,updated_at=? WHERE id=?').bind(status,nowISO(),id).run();
    await audit(env,s.user.id,'USER_STATUS_CHANGED','user',id,{status});
    return json({ok:true,status});
  }
  if(/^\/api\/admin\/users\/\d+\/detail$/.test(p)&&m==='GET'){
    await requireAdmin(req,env);
    const id=Number(p.split('/')[4]);
    await ensureCandidateSchema(env); await ensureRecruiterSchema(env);
    const user=await env.JOB_DB.prepare(`SELECT u.id,u.email,u.phone,u.role,u.status,u.created_at,u.last_login_at,
      s.plan,s.started_at,s.expires_at,s.status subscription_status,
      cp.first_name c_first_name,cp.last_name c_last_name,cp.profession,cp.professional_title,cp.city c_city,cp.country c_country,cp.skills,cp.availability,
      rp.first_name r_first_name,rp.last_name r_last_name,rp.company_name,rp.job_title,rp.company_city,rp.company_country,rp.verification_status
      FROM users u
      LEFT JOIN subscriptions s ON s.id=(SELECT id FROM subscriptions WHERE user_id=u.id ORDER BY datetime(expires_at) DESC,id DESC LIMIT 1)
      LEFT JOIN candidate_profiles cp ON cp.user_id=u.id
      LEFT JOIN recruiter_profiles rp ON rp.user_id=u.id
      WHERE u.id=?`).bind(id).first();
    if(!user) return json({error:'Membre introuvable.'},404);
    let publications={};
    if(user.role==='recruiter'){
      const [jobs,apps]=await Promise.all([
        env.JOB_DB.prepare('SELECT COUNT(*) n FROM jobs WHERE recruiter_id=?').bind(id).first(),
        env.JOB_DB.prepare('SELECT COUNT(*) n FROM applications a JOIN jobs j ON j.id=a.job_id WHERE j.recruiter_id=?').bind(id).first()
      ]);
      publications={jobs:Number(jobs?.n||0),applications:Number(apps?.n||0)};
    }else if(user.role==='candidate'){
      const apps=await env.JOB_DB.prepare('SELECT COUNT(*) n FROM applications WHERE candidate_id=?').bind(id).first();
      publications={applications:Number(apps?.n||0)};
    }
    const subs=await env.JOB_DB.prepare('SELECT id,plan,started_at,expires_at,status,created_at FROM subscriptions WHERE user_id=? ORDER BY id DESC LIMIT 50').bind(id).all();
    return json({user,publications,subscriptions:subs.results||[]});
  }
  if(/^\/api\/admin\/users\/\d+\/subscription$/.test(p)&&m==='POST'){
    const s=await requireAdmin(req,env),id=Number(p.split('/')[4]),b=await req.json().catch(()=>({}));
    const target=await env.JOB_DB.prepare('SELECT id,role FROM users WHERE id=?').bind(id).first();
    if(!target) return json({error:'Membre introuvable.'},404);
    if(target.role==='super_admin') return json({error:'Le Super Admin permanent n’utilise pas d’abonnement.'},400);
    const plan=['free','standard','business'].includes(b.plan)?b.plan:null;
    const days=Number(b.days||0);
    if(!plan||(plan!=='free'&&(days<1||days>730))) return json({error:'Formule ou durée invalide.'},400);
    const expiresAt=plan==='free'?'2099-12-31T23:59:59Z':addDays(days);
    const notice=plan==='free'?'Votre formule est maintenant FREE avec consultation permanente. Les actions professionnelles nécessitent STANDARD ou BUSINESS.':`Votre formule est maintenant ${plan.toUpperCase()} pour ${days} jour(s).`;
    await env.JOB_DB.batch([
      env.JOB_DB.prepare("UPDATE subscriptions SET status='expired',updated_at=? WHERE user_id=? AND status='active'").bind(nowISO(),id),
      env.JOB_DB.prepare("INSERT INTO subscriptions(user_id,plan,started_at,expires_at,status) VALUES(?,?,?,?, 'active')").bind(id,plan,nowISO(),expiresAt),
      env.JOB_DB.prepare("UPDATE users SET status='active',updated_at=? WHERE id=? AND role IN ('candidate','recruiter')").bind(nowISO(),id),
      env.JOB_DB.prepare("INSERT INTO notifications(user_id,type,title,content) VALUES(?,'subscription','Abonnement modifié par GLOBAL EMPLOI',?)").bind(id,notice)
    ]);
    await audit(env,s.user.id,'ADMIN_SUBSCRIPTION_CHANGED','user',id,{plan,days:plan==='free'?null:days});
    return json({ok:true});
  }
  if(/^\/api\/admin\/users\/\d+\/notify$/.test(p)&&m==='POST'){
    const s=await requireAdmin(req,env),id=Number(p.split('/')[4]),b=await req.json().catch(()=>({}));
    const title=safeText(b.title,160),content=safeText(b.content,1800);
    if(!title||!content) return json({error:'Titre et message obligatoires.'},400);
    const target=await env.JOB_DB.prepare('SELECT id FROM users WHERE id=?').bind(id).first();
    if(!target) return json({error:'Membre introuvable.'},404);
    await env.JOB_DB.prepare("INSERT INTO notifications(user_id,type,title,content) VALUES(?,'admin',?,?)").bind(id,title,content).run();
    await audit(env,s.user.id,'ADMIN_NOTIFICATION_SENT','user',id,{title});
    return json({ok:true});
  }
  if(/^\/api\/admin\/users\/\d+\/invalidate-sessions$/.test(p)&&m==='POST'){
    const s=await requireAdmin(req,env),id=Number(p.split('/')[4]);
    const target=await env.JOB_DB.prepare('SELECT role FROM users WHERE id=?').bind(id).first();
    if(!target) return json({error:'Membre introuvable.'},404);
    if(target.role==='super_admin' && id===s.user.id) return json({error:'Utilisez le changement de mot de passe pour votre propre compte.'},400);
    await env.JOB_DB.prepare('UPDATE users SET session_version=session_version+1,updated_at=? WHERE id=?').bind(nowISO(),id).run();
    await audit(env,s.user.id,'ADMIN_SESSIONS_INVALIDATED','user',id);
    return json({ok:true});
  }
  if(p==='/api/admin/activation-history'&&m==='GET'){
    await requireAdmin(req,env); await ensureAdminDataReady(env);
    const status=safeText(url.searchParams.get('status'),30);
    const rows=await env.JOB_DB.prepare(`SELECT sr.*,COALESCE(u.email,'Compte supprimé #'||sr.user_id) email,COALESCE(u.role,'unknown') role,a.email admin_email
      FROM subscription_requests sr LEFT JOIN users u ON u.id=sr.user_id
      LEFT JOIN users a ON a.id=sr.admin_id
      WHERE (?='' OR sr.status=?)
      ORDER BY sr.id DESC`).bind(status,status).all();
    return json({requests:rows.results||[]});
  }
  if(p==='/api/admin/recruiter-verifications/all'&&m==='GET'){
    await requireAdmin(req,env); await ensureAdminDataReady(env);
    const rows=await env.JOB_DB.prepare(`SELECT r.user_id,r.first_name,r.last_name,r.job_title,r.company_name,r.organization_type,r.sector,r.company_city,
      r.verification_status,r.verification_note,r.updated_at,u.email,u.phone
      FROM recruiter_profiles r LEFT JOIN users u ON u.id=r.user_id
      ORDER BY CASE r.verification_status WHEN 'pending' THEN 0 WHEN 'unverified' THEN 1 ELSE 2 END,r.updated_at DESC`).all();
    return json({recruiters:rows.results||[]});
  }
  if(/^\/api\/admin\/jobs\/\d+\/status$/.test(p)&&m==='POST'){
    const s=await requireAdmin(req,env),id=Number(p.split('/')[4]),b=await req.json().catch(()=>({}));
    const status=['published','draft','suspended','closed','expired'].includes(b.status)?b.status:null;
    if(!status) return json({error:'Statut invalide.'},400);
    await env.JOB_DB.prepare('UPDATE jobs SET status=?,updated_at=? WHERE id=?').bind(status,nowISO(),id).run();
    await audit(env,s.user.id,'ADMIN_JOB_STATUS_CHANGED','job',id,{status});
    return json({ok:true,status});
  }
  if(p==='/api/admin/report'&&m==='GET'){
    await requireAdmin(req,env);
    const days=Math.min(366,Math.max(1,Number(url.searchParams.get('days')||30)));
    const modifier=`-${days} days`;
    const [newUsers,newCandidates,newRecruiters,newJobs,newApps,activatedStandard,activatedBusiness,expiredPaid,pending]=await Promise.all([
      env.JOB_DB.prepare("SELECT COUNT(*) n FROM users WHERE role!='super_admin' AND datetime(created_at)>=datetime('now',?)").bind(modifier).first(),
      env.JOB_DB.prepare("SELECT COUNT(*) n FROM users WHERE role='candidate' AND datetime(created_at)>=datetime('now',?)").bind(modifier).first(),
      env.JOB_DB.prepare("SELECT COUNT(*) n FROM users WHERE role='recruiter' AND datetime(created_at)>=datetime('now',?)").bind(modifier).first(),
      env.JOB_DB.prepare("SELECT COUNT(*) n FROM jobs WHERE datetime(created_at)>=datetime('now',?)").bind(modifier).first(),
      env.JOB_DB.prepare("SELECT COUNT(*) n FROM applications WHERE datetime(created_at)>=datetime('now',?)").bind(modifier).first(),
      env.JOB_DB.prepare("SELECT COUNT(*) n FROM subscriptions WHERE plan='standard' AND datetime(created_at)>=datetime('now',?)").bind(modifier).first(),
      env.JOB_DB.prepare("SELECT COUNT(*) n FROM subscriptions WHERE plan='business' AND datetime(created_at)>=datetime('now',?)").bind(modifier).first(),
      env.JOB_DB.prepare("SELECT COUNT(*) n FROM subscriptions WHERE plan IN ('standard','business') AND status='expired' AND datetime(updated_at)>=datetime('now',?)").bind(modifier).first(),
      env.JOB_DB.prepare("SELECT COUNT(*) n FROM subscription_requests WHERE status='pending'").first()
    ]);
    const standard=Number(activatedStandard?.n||0),business=Number(activatedBusiness?.n||0);
    return json({days,new_users:Number(newUsers?.n||0),new_candidates:Number(newCandidates?.n||0),new_recruiters:Number(newRecruiters?.n||0),
      new_jobs:Number(newJobs?.n||0),new_applications:Number(newApps?.n||0),standard,business,expired_paid:Number(expiredPaid?.n||0),
      pending_activations:Number(pending?.n||0),theoretical_revenue:standard*1000+business*10000});
  }
  if(p==='/api/admin/settings'&&m==='GET'){
    await requireAdmin(req,env);
    const settings=await getAppSettings(env);
    return json({settings});
  }
  if(p==='/api/admin/settings'&&m==='POST'){
    const s=await requireAdmin(req,env),b=await req.json().catch(()=>({}));
    await ensureAdminModuleSchema(env);
    const allowed=['platform_name','support_whatsapp','wave_payment_url','standard_price','business_price','free_days','standard_days','business_days','default_country','contact_email'];
    const stmts=[];
    for(const key of allowed){
      if(Object.prototype.hasOwnProperty.call(b,key)){
        const value=safeText(String(b[key]??''),800);
        stmts.push(env.JOB_DB.prepare(`INSERT INTO app_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)
          ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by`).bind(key,value,nowISO(),s.user.id));
      }
    }
    if(stmts.length) await env.JOB_DB.batch(stmts);
    await audit(env,s.user.id,'ADMIN_SETTINGS_UPDATED','settings',null,{keys:allowed.filter(k=>Object.prototype.hasOwnProperty.call(b,k))});
    return json({ok:true});
  }
  if(p==='/api/admin/messages'&&m==='GET'){
    await requireAdmin(req,env); await ensureAdminDataReady(env);
    const support=await env.JOB_DB.prepare(`SELECT sm.*,su.email sender_email,ru.email recipient_email FROM support_messages sm
      LEFT JOIN users su ON su.id=sm.sender_user_id LEFT JOIN users ru ON ru.id=sm.recipient_user_id ORDER BY sm.id DESC`).all();
    const privateRows=await env.JOB_DB.prepare(`SELECT m.id,m.conversation_id,m.sender_id,m.content,m.read_at,m.created_at,
      COALESCE(su.email,'Compte #'||m.sender_id) sender_email,
      GROUP_CONCAT(CASE WHEN cm.user_id<>m.sender_id THEN COALESCE(ou.email,'Compte #'||cm.user_id) END, ', ') recipient_emails
      FROM messages m
      LEFT JOIN users su ON su.id=m.sender_id
      LEFT JOIN conversation_members cm ON cm.conversation_id=m.conversation_id
      LEFT JOIN users ou ON ou.id=cm.user_id
      GROUP BY m.id,m.conversation_id,m.sender_id,m.content,m.read_at,m.created_at,su.email
      ORDER BY m.id DESC`).all();
    return json({support_messages:support.results||[],private_messages:privateRows.results||[]});
  }
  if(p==='/api/support/messages'&&m==='GET'){
    const s=await requireSession(req,env); await ensureAdminModuleSchema(env);
    let rows;
    if(s.user.role==='super_admin'){
      rows=await env.JOB_DB.prepare(`SELECT sm.*,su.email sender_email,ru.email recipient_email FROM support_messages sm
        LEFT JOIN users su ON su.id=sm.sender_user_id LEFT JOIN users ru ON ru.id=sm.recipient_user_id
        ORDER BY sm.id DESC`).all();
    }else{
      rows=await env.JOB_DB.prepare(`SELECT sm.*,su.email sender_email,ru.email recipient_email FROM support_messages sm
        LEFT JOIN users su ON su.id=sm.sender_user_id LEFT JOIN users ru ON ru.id=sm.recipient_user_id
        WHERE sm.sender_user_id=? OR sm.recipient_user_id=? ORDER BY sm.id DESC LIMIT 150`).bind(s.user.id,s.user.id).all();
    }
    return json({messages:rows.results||[]});
  }
  if(p==='/api/support/messages'&&m==='POST'){
    const s=await requireSession(req,env); await ensureAdminModuleSchema(env); const b=await req.json().catch(()=>({}));
    const content=safeText(b.content,2500),subject=safeText(b.subject,180),category=safeText(b.category||'support',50);
    if(!content) return json({error:'Message obligatoire.'},400);
    let recipient=null;
    if(s.user.role==='super_admin'){
      recipient=Number(b.recipient_user_id)||null;
      if(!recipient) return json({error:'Destinataire obligatoire.'},400);
    }
    await env.JOB_DB.prepare('INSERT INTO support_messages(sender_user_id,recipient_user_id,subject,content,category,status) VALUES(?,?,?,?,?,?)')
      .bind(s.user.id,recipient,subject,content,category,'unread').run();
    if(recipient) await env.JOB_DB.prepare("INSERT INTO notifications(user_id,type,title,content) VALUES(?,'support','Message du support GLOBAL EMPLOI',?)").bind(recipient,content.slice(0,600)).run();
    return json({ok:true});
  }
  if(/^\/api\/support\/messages\/\d+\/status$/.test(p)&&m==='POST'){
    const s=await requireSession(req,env); await ensureAdminModuleSchema(env);
    const id=Number(p.split('/')[4]),b=await req.json().catch(()=>({}));
    const status=['unread','read','archived'].includes(b.status)?b.status:null;
    if(!status) return json({error:'Statut invalide.'},400);
    if(s.user.role==='super_admin') await env.JOB_DB.prepare('UPDATE support_messages SET status=?,updated_at=? WHERE id=?').bind(status,nowISO(),id).run();
    else await env.JOB_DB.prepare('UPDATE support_messages SET status=?,updated_at=? WHERE id=? AND (sender_user_id=? OR recipient_user_id=?)').bind(status,nowISO(),id,s.user.id,s.user.id).run();
    return json({ok:true});
  }
  if(p==='/api/admin/inbox'&&m==='GET'){
    await requireAdmin(req,env);
    await ensureAdminDataReady(env);
    const [registrations,activations,verifications,support,recruitments,applications]=await Promise.all([
      env.JOB_DB.prepare(`SELECT u.id,u.email,u.phone,u.role,u.status,u.created_at,u.last_login_at,
        s.plan,s.expires_at,s.status subscription_status
        FROM users u LEFT JOIN subscriptions s ON s.id=(SELECT id FROM subscriptions WHERE user_id=u.id ORDER BY id DESC LIMIT 1)
        WHERE u.role IN ('candidate','recruiter') ORDER BY u.id DESC`).all(),
      env.JOB_DB.prepare(`SELECT sr.*,COALESCE(u.email,'Compte supprimé #'||sr.user_id) email,COALESCE(u.role,'unknown') role FROM subscription_requests sr LEFT JOIN users u ON u.id=sr.user_id ORDER BY sr.id DESC`).all(),
      env.JOB_DB.prepare(`SELECT r.user_id,r.first_name,r.last_name,r.company_name,r.verification_status,r.verification_note,r.updated_at,u.email,u.phone
        FROM recruiter_profiles r LEFT JOIN users u ON u.id=r.user_id ORDER BY r.updated_at DESC`).all(),
      env.JOB_DB.prepare(`SELECT sm.*,su.email sender_email,ru.email recipient_email FROM support_messages sm
        LEFT JOIN users su ON su.id=sm.sender_user_id LEFT JOIN users ru ON ru.id=sm.recipient_user_id ORDER BY sm.id DESC`).all(),
      env.JOB_DB.prepare(`SELECT rr.*,ru.email recruiter_email,cu.email candidate_email,rp.company_name
        FROM recruitment_requests rr LEFT JOIN users ru ON ru.id=rr.recruiter_id LEFT JOIN users cu ON cu.id=rr.candidate_id
        LEFT JOIN recruiter_profiles rp ON rp.user_id=rr.recruiter_id ORDER BY rr.id DESC`).all(),
      env.JOB_DB.prepare(`SELECT a.id,a.status,a.created_at,j.id job_id,j.title,cu.email candidate_email,ru.email recruiter_email,rp.company_name
        FROM applications a LEFT JOIN jobs j ON j.id=a.job_id LEFT JOIN users cu ON cu.id=a.candidate_id LEFT JOIN users ru ON ru.id=j.recruiter_id
        LEFT JOIN recruiter_profiles rp ON rp.user_id=ru.id ORDER BY a.id DESC`).all()
    ]);
    return json({
      registrations:registrations.results||[],
      activation_requests:activations.results||[],
      verification_requests:verifications.results||[],
      support_requests:support.results||[],
      recruitment_requests:recruitments.results||[],
      applications:applications.results||[]
    });
  }
  if(p==='/api/admin/users'&&m==='GET'){ await requireAdmin(req,env); await ensureAdminDataReady(env); const rows=await env.JOB_DB.prepare(`SELECT u.id,u.email,u.phone,u.member_code,u.role,u.status,u.created_at,u.last_login_at,s.plan,s.expires_at,s.status subscription_status,cp.first_name candidate_first_name,cp.last_name candidate_last_name,rp.first_name recruiter_first_name,rp.last_name recruiter_last_name,rp.company_name FROM users u LEFT JOIN subscriptions s ON s.id=(SELECT id FROM subscriptions WHERE user_id=u.id ORDER BY datetime(expires_at) DESC,id DESC LIMIT 1) LEFT JOIN candidate_profiles cp ON cp.user_id=u.id LEFT JOIN recruiter_profiles rp ON rp.user_id=u.id ORDER BY u.id DESC`).all(); return json({users:rows.results||[]}); }
  return json({error:'Route API introuvable.'},404);
}

export default {
  async fetch(request, env){
    const url=new URL(request.url);
    try{
      assertBindings(env);

      // Une URL contenant des identifiants ne doit jamais être conservée ou propagée.
      // On la nettoie immédiatement avant de servir l'application.
      if(!url.pathname.startsWith('/api/')){
        const sensitive=['email','password','recovery_token','token'];
        let dirty=false;
        for(const key of sensitive){ if(url.searchParams.has(key)){ url.searchParams.delete(key); dirty=true; } }
        if(dirty){
          const clean=url.pathname+(url.searchParams.toString()?`?${url.searchParams.toString()}`:'')+url.hash;
          return new Response(null,{status:303,headers:{
            'location':clean||'/',
            'cache-control':'no-store',
            'referrer-policy':'no-referrer',
            'x-content-type-options':'nosniff'
          }});
        }
      }

      if(url.pathname.startsWith('/api/')){
        // V31 : AUCUNE migration, archive, import legacy ou réparation globale dans le chemin
        // d'une requête métier. C'était la cause des délais de 20 s sur tous les menus.
        // Les routes consultent directement D1. Les contrôles globaux ne sont exécutés que
        // lorsqu'on appelle volontairement /api/health ou /api/data-linkage.
        const response=await api(request,env,url);
        const h=new Headers(response.headers);
        h.set('cache-control','no-store');
        h.set('referrer-policy','no-referrer');
        h.set('x-content-type-options','nosniff');
        h.set('x-frame-options','DENY');
        return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h});
      }
      assertAssetsBinding(env);
      const asset=await env.ASSETS.fetch(request);
      const h=new Headers(asset.headers);
      h.set('referrer-policy','no-referrer');
      h.set('x-content-type-options','nosniff');
      h.set('x-frame-options','DENY');
      h.set('permissions-policy','camera=(), microphone=(), geolocation=()');
      if(url.pathname==='/'||url.pathname.endsWith('.html')) h.set('cache-control','no-store');
      return new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers:h});
    } catch(err){
      if(err instanceof Response) return err;
      const requestId=request.headers.get('cf-ray')||crypto.randomUUID();
      console.error('GLOBAL_EMPLOI_SERVER_ERROR',{requestId,code:err?.code||'SERVER_ERROR',message:err?.message||String(err),cause:err?.cause?.message||null,stack:err?.stack});
      const code=err?.code||'SERVER_ERROR';
      const raw=String(err?.message||'');
      const safeDetail=(code.startsWith('D1_')||code.includes('SCHEMA')||code.includes('LINK')) ? raw.slice(0,500) : '';
      const message=err?.publicMessage||'Erreur serveur. Consultez les journaux Cloudflare avec la référence indiquée.';
      return json({error:message,code,reference:requestId,detail:safeDetail},500);
    }
  }
};
