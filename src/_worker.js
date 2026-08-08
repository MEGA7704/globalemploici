const enc = new TextEncoder();
const dec = new TextDecoder();

function json(data, status=200, headers={}) {
  return new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
}
function nowISO(){ return new Date().toISOString(); }
function addDays(days){ const d=new Date(); d.setUTCDate(d.getUTCDate()+days); return d.toISOString(); }
function parseCookies(req){ const out={}; (req.headers.get('cookie')||'').split(';').forEach(p=>{const i=p.indexOf('='); if(i>0) out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim());}); return out; }
function b64(bytes){ return btoa(String.fromCharCode(...bytes)); }
function fromB64(s){ return Uint8Array.from(atob(s), c=>c.charCodeAt(0)); }
function safeText(v,max=4000){ return String(v??'').trim().slice(0,max); }
function validEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function sessionCookie(token,maxAge=86400){ return `ge_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`; }
function clearCookie(){ return 'ge_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'; }

function serverError(code, message, status=500){
  return json({error:message, code}, status);
}

function assertBindings(env){
  const missing=[];
  if(!env.JOB_DB) missing.push('JOB_DB');
  if(!env.JOB_KV) missing.push('JOB_KV');
  if(!env.ASSETS) missing.push('ASSETS');
  if(missing.length){
    const e=new Error(`Missing bindings: ${missing.join(', ')}`);
    e.code='BINDING_MISSING';
    e.publicMessage=`Configuration Cloudflare incomplète : binding ${missing.join(', ')} manquant.`;
    throw e;
  }
}

async function checkDatabase(env){
  try{
    const required=['users','candidate_profiles','recruiter_profiles','subscriptions','subscription_requests','jobs','applications','conversations','conversation_members','messages','notifications','audit_logs'];
    const rows=await env.JOB_DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const have=new Set((rows.results||[]).map(r=>r.name));
    const missing=required.filter(t=>!have.has(t));
    if(missing.length){
      const e=new Error('D1 schema incomplete: '+missing.join(', '));
      e.code='D1_SCHEMA_INCOMPLETE';
      e.publicMessage='Schéma D1 incomplet. Tables manquantes : '+missing.join(', ');
      throw e;
    }
    return true;
  }catch(err){
    if(err && err.code==='D1_NOT_INITIALIZED') throw err;
    const e=new Error(`D1 unavailable: ${err?.message||err}`);
    e.code='D1_UNAVAILABLE';
    e.publicMessage='La base D1 est indisponible ou mal liée au projet.';
    throw e;
  }
}

async function checkKV(env){
  try{
    const key='health:'+crypto.randomUUID();
    await env.JOB_KV.put(key,'1',{expirationTtl:60});
    const got=await env.JOB_KV.get(key);
    await env.JOB_KV.delete(key);
    if(got!=='1') throw new Error('KV read/write test failed');
    return true;
  }catch(err){
    const e=new Error(`KV unavailable: ${err?.message||err}`);
    e.code='KV_UNAVAILABLE';
    e.publicMessage='Le namespace KV est indisponible ou mal lié au projet.';
    throw e;
  }
}

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
  const u=await env.JOB_DB.prepare('SELECT id,email,phone,role,status,session_version FROM users WHERE id=?').bind(s.userId).first();
  if(!u || u.status!=='active' || u.session_version!==s.version){ await env.JOB_KV.delete(`sess:${token}`); return null; }
  return {...s, token, user:u};
}
async function requireSession(req,env){ const s=await getSession(req,env); if(!s) throw new Response(JSON.stringify({error:'Authentification requise'}),{status:401,headers:{'content-type':'application/json'}}); return s; }
async function requireAdmin(req,env){ const s=await requireSession(req,env); if(s.user.role!=='super_admin') throw new Response(JSON.stringify({error:'Accès interdit'}),{status:403,headers:{'content-type':'application/json'}}); return s; }
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
  const s=await env.JOB_DB.prepare("SELECT * FROM subscriptions WHERE user_id=? ORDER BY datetime(expires_at) DESC LIMIT 1").bind(userId).first();
  if(!s) return null;
  const active=new Date(s.expires_at)>new Date() && s.status==='active';
  return {...s, effective_status:active?'active':'expired'};
}


async function ensureCandidateSchema(env){
  const info=await env.JOB_DB.prepare("PRAGMA table_info(candidate_profiles)").all();
  const have=new Set((info.results||[]).map(x=>x.name));
  const cols={gender:'TEXT',birth_date:'TEXT',nationality:'TEXT',marital_status:'TEXT',whatsapp:'TEXT',country:'TEXT',professional_title:'TEXT',activity_domain:'TEXT',other_skills:'TEXT',experience_level:'TEXT',current_situation:'TEXT',driving_license:'INTEGER DEFAULT 0',driving_category:'TEXT',education_level:'TEXT',target_position:'TEXT',target_domain:'TEXT',desired_contracts:'TEXT',desired_city:'TEXT',mobility:'TEXT',desired_salary:'INTEGER',accepts_travel:'INTEGER DEFAULT 0',job_alerts:'INTEGER DEFAULT 0'};
  for(const [name,type] of Object.entries(cols)) if(!have.has(name)) await env.JOB_DB.prepare(`ALTER TABLE candidate_profiles ADD COLUMN ${name} ${type}`).run();
  await env.JOB_DB.exec(`
    CREATE TABLE IF NOT EXISTS candidate_education (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,diploma TEXT,specialty TEXT,institution TEXT,graduation_year TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS idx_candidate_education_user ON candidate_education(user_id);
    CREATE TABLE IF NOT EXISTS candidate_experiences (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,position TEXT,company TEXT,city_country TEXT,start_date TEXT,end_date TEXT,current_job INTEGER NOT NULL DEFAULT 0,responsibilities TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS idx_candidate_experiences_user ON candidate_experiences(user_id);
    CREATE TABLE IF NOT EXISTS candidate_languages (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,language TEXT NOT NULL,level TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS idx_candidate_languages_user ON candidate_languages(user_id);
    CREATE TABLE IF NOT EXISTS candidate_documents (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,document_type TEXT NOT NULL,file_name TEXT NOT NULL,mime_type TEXT NOT NULL,size_bytes INTEGER NOT NULL,content BLOB NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS idx_candidate_documents_user ON candidate_documents(user_id,document_type);
  `);

}
async function ensureRecruiterSchema(env){
  const info=await env.JOB_DB.prepare("PRAGMA table_info(recruiter_profiles)").all();
  const have=new Set((info.results||[]).map(x=>x.name));
  const cols={
    first_name:'TEXT',last_name:'TEXT',job_title:'TEXT',whatsapp:'TEXT',country:'TEXT',photo:'TEXT',
    trade_name:'TEXT',organization_type:'TEXT',sector:'TEXT',main_domain:'TEXT',foundation_year:'TEXT',
    employee_count:'TEXT',company_country:'TEXT',company_city:'TEXT',district:'TEXT',website:'TEXT',social_page:'TEXT',
    rccm:'TEXT',tax_id:'TEXT',cnps:'TEXT',desired_trades:'TEXT',recruitment_domains:'TEXT',
    annual_recruitment_count:'TEXT',contract_types:'TEXT',recruitment_zones:'TEXT',
    international_recruitment:'INTEGER DEFAULT 0',marketing_alerts:'INTEGER DEFAULT 0',
    verification_status:"TEXT DEFAULT 'unverified'",verification_note:'TEXT',
    email_verified:'INTEGER DEFAULT 0',phone_verified:'INTEGER DEFAULT 0',
    company_info_verified:'INTEGER DEFAULT 0',official_document_verified:'INTEGER DEFAULT 0'
  };
  for(const [name,type] of Object.entries(cols)) if(!have.has(name)) await env.JOB_DB.prepare(`ALTER TABLE recruiter_profiles ADD COLUMN ${name} ${type}`).run();
  await env.JOB_DB.exec(`
    CREATE TABLE IF NOT EXISTS recruiter_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      content BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_recruiter_documents_user ON recruiter_documents(user_id,document_type);
  `);
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
  await env.JOB_DB.exec(`
    CREATE TABLE IF NOT EXISTS recruitment_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recruiter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      candidate_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'sent',
      message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(recruiter_id,candidate_id)
    );
    CREATE INDEX IF NOT EXISTS idx_recruitment_requests_recruiter ON recruitment_requests(recruiter_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_recruitment_requests_candidate ON recruitment_requests(candidate_id,created_at DESC);
  `);
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
  const lock='maintenance:subscriptions:v11';
  try{ if(await env.JOB_KV.get(lock)) return; await env.JOB_KV.put(lock,'1',{expirationTtl:60}); }catch{}
  const now=nowISO();

  // Normalise les anciennes périodes FREE à 7 jours.
  await env.JOB_DB.prepare(`UPDATE subscriptions
    SET expires_at=strftime('%Y-%m-%dT%H:%M:%SZ',datetime(started_at,'+7 days')),updated_at=?
    WHERE plan='free' AND status='active'
      AND datetime(expires_at) != datetime(started_at,'+7 days')`).bind(now).run();

  // Tout abonnement payant arrivé à terme devient expiré.
  await env.JOB_DB.prepare(`UPDATE subscriptions SET status='expired',updated_at=?
    WHERE plan IN ('standard','business') AND status='active' AND datetime(expires_at)<=datetime('now')`).bind(now).run();

  // Après expiration du dernier abonnement payant, le compte repasse en FREE pendant 7 jours.
  // Cette période commence à la date d'expiration du payant, pas à la date de la prochaine visite.
  const expiredPaid=await env.JOB_DB.prepare(`SELECT s.user_id, MAX(s.expires_at) paid_expiry
    FROM subscriptions s JOIN users u ON u.id=s.user_id
    WHERE s.plan IN ('standard','business') AND datetime(s.expires_at)<=datetime('now')
      AND u.role IN ('candidate','recruiter')
      AND NOT EXISTS(
        SELECT 1 FROM subscriptions a WHERE a.user_id=s.user_id
        AND a.plan IN ('standard','business') AND a.status='active' AND datetime(a.expires_at)>datetime('now')
      )
    GROUP BY s.user_id LIMIT 100`).all();

  for(const row of (expiredPaid.results||[])){
    const uid=Number(row.user_id), paidExpiry=row.paid_expiry;
    const grace=await env.JOB_DB.prepare(`SELECT id FROM subscriptions WHERE user_id=? AND plan='free'
      AND started_at=? LIMIT 1`).bind(uid,paidExpiry).first();
    if(!grace){
      await env.JOB_DB.prepare(`INSERT INTO subscriptions(user_id,plan,started_at,expires_at,status,created_at,updated_at)
        VALUES(?,?,?,strftime('%Y-%m-%dT%H:%M:%SZ',datetime(?,'+7 days')),'active',?,?)`)
        .bind(uid,'free',paidExpiry,paidExpiry,now,now).run();
      await env.JOB_DB.prepare(`INSERT INTO notifications(user_id,type,title,content)
        VALUES(?,'subscription','Abonnement payant expiré','Votre compte est repassé en FREE pour 7 jours. Vos publications sont masquées et les actions Je postule / Je recrute sont désactivées. Renouvelez avant la fin des 7 jours pour éviter la suppression automatique du compte.')`).bind(uid).run();
    }
  }

  // Les FREE dépassés deviennent expirés.
  await env.JOB_DB.prepare(`UPDATE subscriptions SET status='expired',updated_at=?
    WHERE plan='free' AND status='active' AND datetime(expires_at)<=datetime('now')`).bind(now).run();

  // Supprime le compte 7 jours après la fin du payant (ou après le FREE initial)
  // uniquement s'il n'existe aucun nouvel abonnement STANDARD/BUSINESS actif.
  const doomed=await env.JOB_DB.prepare(`SELECT u.id
    FROM users u
    WHERE u.role IN ('candidate','recruiter')
      AND NOT EXISTS(
        SELECT 1 FROM subscriptions p WHERE p.user_id=u.id
        AND p.plan IN ('standard','business') AND p.status='active' AND datetime(p.expires_at)>datetime('now')
      )
      AND EXISTS(
        SELECT 1 FROM subscriptions f WHERE f.user_id=u.id AND f.plan='free'
        AND datetime(f.expires_at)<=datetime('now')
      )
      AND NOT EXISTS(
        SELECT 1 FROM subscriptions f2 WHERE f2.user_id=u.id AND f2.plan='free'
        AND f2.status='active' AND datetime(f2.expires_at)>datetime('now')
      )
    LIMIT 50`).all();

  for(const row of (doomed.results||[])){
    try{ await deleteUserAndRelatedData(env,Number(row.id)); }
    catch(err){ console.error('ACCOUNT_EXPIRY_CLEANUP_FAILED',row.id,err?.message||String(err)); }
  }
}

async function ensureAdminModuleSchema(env){
  await env.JOB_DB.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS support_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      recipient_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      subject TEXT,
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'support',
      status TEXT NOT NULL DEFAULT 'unread',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_support_messages_recipient ON support_messages(recipient_user_id,status,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_support_messages_sender ON support_messages(sender_user_id,created_at DESC);
  `);
}
async function getAppSettings(env){
  await ensureAdminModuleSchema(env);
  const rows=await env.JOB_DB.prepare('SELECT key,value FROM app_settings').all();
  const map={};
  for(const row of (rows.results||[])) map[row.key]=row.value;
  return map;
}
async function handleRegister(req,env){
  const b=await req.json().catch(()=>({})); const role=b.role==='recruiter'?'recruiter':'candidate';
  const email=safeText(b.email,190).toLowerCase(), password=String(b.password||''), phone=safeText(b.phone,40);
  if(!validEmail(email)||password.length<8) return json({error:'E-mail invalide ou mot de passe trop court.'},400);
  if(role==='candidate' && (!b.terms || !safeText(b.last_name,100) || !safeText(b.first_name,100) || !safeText(b.birth_date,20) || !safeText(b.nationality,100) || !phone || !safeText(b.city,120) || !safeText(b.country,100))) return json({error:'Veuillez compléter toutes les informations personnelles obligatoires et accepter les conditions.'},400);
  if(role==='recruiter' && (!b.terms || !b.privacy || !safeText(b.last_name,100) || !safeText(b.first_name,100) || !safeText(b.job_title,150) || !phone || !safeText(b.country,100))) return json({error:'Veuillez compléter les informations obligatoires du recruteur et accepter les conditions et la politique de confidentialité.'},400);
  const exists=await env.JOB_DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first(); if(exists) return json({error:'Ce compte existe déjà.'},409);
  let userId=null;
  try{
    const p=await createPassword(password);
    const ins=await env.JOB_DB.prepare('INSERT INTO users(email,phone,password_hash,password_salt,role) VALUES(?,?,?,?,?)').bind(email,phone,p.hash,p.salt,role).run();
    userId=Number(ins?.meta?.last_row_id);
    if(!userId) throw new Error('User insert did not return last_row_id');
    if(role==='candidate') { await ensureCandidateSchema(env); await env.JOB_DB.prepare('INSERT INTO candidate_profiles(user_id,first_name,last_name,gender,birth_date,nationality,marital_status,whatsapp,city,location,country,photo,job_alerts) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(userId,safeText(b.first_name,100),safeText(b.last_name,100),safeText(b.gender,20),safeText(b.birth_date,20),safeText(b.nationality,100),safeText(b.marital_status,80),safeText(b.whatsapp,40),safeText(b.city,120),safeText(b.location,180),safeText(b.country,100),safeText(b.photo,900000),b.job_alerts?1:0).run(); }
    else { await ensureRecruiterSchema(env); await env.JOB_DB.prepare('INSERT INTO recruiter_profiles(user_id,first_name,last_name,job_title,whatsapp,city,country,photo,marketing_alerts,verification_status) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(userId,safeText(b.first_name,100),safeText(b.last_name,100),safeText(b.job_title,150),safeText(b.whatsapp,40),safeText(b.city,120),safeText(b.country,100),safeText(b.photo,900000),b.marketing_alerts?1:0,'unverified').run(); }
    const expires=addDays(7);
    await env.JOB_DB.prepare('INSERT INTO subscriptions(user_id,plan,started_at,expires_at,status) VALUES(?,?,?,?,?)').bind(userId,'free',nowISO(),expires,'active').run();
    const r=await env.JOB_DB.prepare('SELECT id,email,phone,role,status,session_version FROM users WHERE id=?').bind(userId).first();
    const token=await createSession(env,r); await audit(env,r.id,'REGISTER','user',r.id,{role});
    return json({ok:true,user:{id:r.id,email:r.email,role:r.role},subscription:await currentSubscription(env,r.id)},201,{'set-cookie':sessionCookie(token)});
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
async function handleLogin(req,env){
  const b=await req.json().catch(()=>({})); const email=safeText(b.email,190).toLowerCase(), password=String(b.password||'');
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
  return json({ok:true,user:{id:u.id,email:u.email,role:u.role},subscription:await currentSubscription(env,u.id)},200,{'set-cookie':sessionCookie(token)});
}

async function api(req,env,url){
  const p=url.pathname, m=req.method;
  if(p==='/api/health'&&m==='GET'){
    assertBindings(env);
    await checkDatabase(env);
    await checkKV(env);
    const admin=await superAdminStatus(env);
    return json({ok:true,service:'GLOBAL EMPLOI',d1:'ok',kv:'ok',assets:'ok',super_admin:{configured:admin.configured,exists:admin.exists,active:admin.active}});
  }
  if(p==='/api/admin-recovery/status'&&m==='GET') return json(await superAdminStatus(env));
  if(p==='/api/admin-recovery/recover'&&m==='POST') return handleSuperAdminRecover(req,env);
  if(p==='/api/public-stats'&&m==='GET'){
    const [jobs,recruiters,candidates,jobs30,recruiters30,candidates30]=await Promise.all([
      env.JOB_DB.prepare(`SELECT COUNT(*) n FROM jobs j JOIN users u ON u.id=j.recruiter_id
        WHERE j.status='published' AND u.status='active'
        AND EXISTS(SELECT 1 FROM subscriptions s WHERE s.user_id=j.recruiter_id AND s.status='active' AND s.plan IN ('standard','business') AND datetime(s.expires_at)>datetime('now'))`).first(),
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
      await ensureRecruitmentSchema(env);
      const [jobs,visible,apps,recruits,unread]=await Promise.all([
        env.JOB_DB.prepare('SELECT COUNT(*) n FROM jobs WHERE recruiter_id=?').bind(uid).first(),
        env.JOB_DB.prepare(`SELECT COUNT(*) n FROM jobs j WHERE j.recruiter_id=? AND j.status='published'
          AND EXISTS(SELECT 1 FROM subscriptions s WHERE s.user_id=j.recruiter_id AND s.status='active' AND s.plan IN ('standard','business') AND datetime(s.expires_at)>datetime('now'))`).bind(uid).first(),
        env.JOB_DB.prepare('SELECT COUNT(*) n FROM applications a JOIN jobs j ON j.id=a.job_id WHERE j.recruiter_id=?').bind(uid).first(),
        env.JOB_DB.prepare('SELECT COUNT(*) n FROM recruitment_requests WHERE recruiter_id=?').bind(uid).first(),
        env.JOB_DB.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND is_read=0').bind(uid).first()
      ]);
      return json({role,jobs:Number(jobs?.n||0),visible_jobs:Number(visible?.n||0),applications:Number(apps?.n||0),recruitment_requests:Number(recruits?.n||0),unread:Number(unread?.n||0)});
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
    if(sub && sub.plan!=='free' && sub.effective_status==='active') return json({error:'Vous avez déjà un abonnement payant valide.'},409);
    const pending=await env.JOB_DB.prepare("SELECT id FROM subscription_requests WHERE user_id=? AND status='pending'").bind(s.user.id).first(); if(pending) return json({error:'Une demande est déjà en attente.'},409);
    const payer=safeText(b.payer_phone,40), tx=safeText(b.transaction_id,120); if(!payer||!tx) return json({error:'Téléphone et ID transaction obligatoires.'},400);
    await env.JOB_DB.prepare('INSERT INTO subscription_requests(user_id,plan,amount,payer_phone,transaction_id) VALUES(?,?,?,?,?)').bind(s.user.id,plan,amount,payer,tx).run(); await audit(env,s.user.id,'SUBSCRIPTION_REQUEST','subscription',null,{plan,amount}); return json({ok:true});
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
  if(p==='/api/recruiter/jobs'&&m==='GET'){ const s=await requireSession(req,env); if(s.user.role!=='recruiter') return json({error:'Réservé aux recruteurs.'},403); const rows=await env.JOB_DB.prepare('SELECT * FROM jobs WHERE recruiter_id=? ORDER BY id DESC').bind(s.user.id).all(); return json({jobs:rows.results||[]}); }
  if(p==='/api/recruiter/applications'&&m==='GET'){
    const s=await requireSession(req,env); if(s.user.role!=='recruiter') return json({error:'Réservé aux recruteurs.'},403);
    await ensureCandidateSchema(env);
    const rows=await env.JOB_DB.prepare(`SELECT a.id,a.status,a.message,a.created_at,j.id job_id,j.title,
      u.id candidate_id,u.email,u.phone,
      p.first_name,p.last_name,p.profession,p.professional_title,p.specialty,p.city,p.country,p.experience_level,p.experience_years,p.skills,p.description,p.availability,p.target_position,p.desired_contracts
      FROM applications a
      JOIN jobs j ON j.id=a.job_id
      JOIN users u ON u.id=a.candidate_id
      LEFT JOIN candidate_profiles p ON p.user_id=a.candidate_id
      WHERE j.recruiter_id=?
      ORDER BY a.id DESC`).bind(s.user.id).all();
    return json({applications:rows.results||[]});
  }
  if(/^\/api\/jobs\/\d+$/.test(p)&&m==='GET'){
    const id=Number(p.split('/').pop());
    const j=await env.JOB_DB.prepare(`SELECT j.*,r.company_name,r.trade_name,r.sector,r.main_domain,r.description company_description,r.company_city,r.company_country,r.logo
      FROM jobs j
      JOIN users u ON u.id=j.recruiter_id AND u.role='recruiter' AND u.status='active'
      LEFT JOIN recruiter_profiles r ON r.user_id=j.recruiter_id
      WHERE j.id=? AND j.status='published'
      AND EXISTS(SELECT 1 FROM subscriptions s WHERE s.user_id=j.recruiter_id AND s.status='active' AND s.plan IN ('standard','business') AND datetime(s.expires_at)>datetime('now'))`).bind(id).first();
    if(!j) return json({error:'Offre introuvable ou non disponible.'},404);
    return json({job:j});
  }
  if(p==='/api/jobs'&&m==='POST'){
    const s=await requireSession(req,env); if(s.user.role!=='recruiter') return json({error:'Réservé aux recruteurs.'},403);
    const b=await req.json(); if(!b.title||!b.description) return json({error:'Titre et description obligatoires.'},400);
    const r=await env.JOB_DB.prepare('INSERT INTO jobs(recruiter_id,title,profession,category,description,employment_type,location,salary,vacancies,status,starts_at,closes_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id').bind(s.user.id,safeText(b.title,180),safeText(b.profession,150),safeText(b.category,150),safeText(b.description,4000),safeText(b.employment_type,100),safeText(b.location,180),safeText(b.salary,100),Number(b.vacancies||1),'published',safeText(b.starts_at,40)||null,safeText(b.closes_at,40)||null).first(); return json({ok:true,id:r.id},201);
  }
  if(/^\/api\/jobs\/\d+\/apply$/.test(p)&&m==='POST'){
    const s=await requireSession(req,env);
    if(s.user.role!=='candidate') return json({error:'Le bouton « Je postule » est réservé aux demandeurs d’emploi.'},403);
    const paid=await activePaidSubscription(env,s.user.id);
    if(!paid) return json({error:'Votre compte peut consulter les offres, mais « Je postule » nécessite un abonnement STANDARD ou BUSINESS actif.'},403);
    const jobId=Number(p.split('/')[3]);
    const job=await env.JOB_DB.prepare(`SELECT j.id,j.recruiter_id,j.title FROM jobs j JOIN users u ON u.id=j.recruiter_id
      WHERE j.id=? AND j.status='published' AND u.status='active'
      AND EXISTS(SELECT 1 FROM subscriptions s WHERE s.user_id=j.recruiter_id AND s.status='active' AND s.plan IN ('standard','business') AND datetime(s.expires_at)>datetime('now'))`).bind(jobId).first();
    if(!job) return json({error:'Cette offre n’est plus disponible.'},404);
    const b=await req.json().catch(()=>({}));
    try{
      await env.JOB_DB.batch([
        env.JOB_DB.prepare('INSERT INTO applications(job_id,candidate_id,message) VALUES(?,?,?)').bind(jobId,s.user.id,safeText(b.message,1200)),
        env.JOB_DB.prepare("INSERT INTO notifications(user_id,type,title,content) VALUES(?, 'application','Nouvelle candidature',?)").bind(job.recruiter_id,`Un candidat vient de postuler à l’offre « ${safeText(job.title,120)} ».`)
      ]);
      return json({ok:true},201);
    }catch{return json({error:'Vous avez déjà postulé à cette offre.'},409);}
  }
  if(p==='/api/candidates'&&m==='GET'){
    await ensureCandidateSchema(env);
    const q=safeText(url.searchParams.get('q'),120).toLowerCase();
    const city=safeText(url.searchParams.get('city'),120).toLowerCase();
    const likeQ=`%${q}%`, likeCity=`%${city}%`;
    const rows=await env.JOB_DB.prepare(`SELECT u.id,p.first_name,p.last_name,p.profession,p.professional_title,p.specialty,p.city,p.country,p.experience_level,p.experience_years,p.skills,p.availability,p.photo,p.target_position,
      (SELECT s.plan FROM subscriptions s WHERE s.user_id=u.id AND s.status='active' AND s.plan IN ('standard','business') AND datetime(s.expires_at)>datetime('now') ORDER BY datetime(s.expires_at) DESC LIMIT 1) plan
      FROM users u JOIN candidate_profiles p ON p.user_id=u.id
      WHERE u.role='candidate' AND u.status='active'
      AND EXISTS(SELECT 1 FROM subscriptions s WHERE s.user_id=u.id AND s.status='active' AND s.plan IN ('standard','business') AND datetime(s.expires_at)>datetime('now'))
      AND (?='' OR lower(COALESCE(p.profession,'')) LIKE ? OR lower(COALESCE(p.professional_title,'')) LIKE ? OR lower(COALESCE(p.specialty,'')) LIKE ? OR lower(COALESCE(p.skills,'')) LIKE ?)
      AND (?='' OR lower(COALESCE(p.city,'')) LIKE ?)
      ORDER BY u.id DESC LIMIT 200`).bind(q,likeQ,likeQ,likeQ,likeQ,city,likeCity).all();
    return json({candidates:rows.results||[]});
  }
  if(/^\/api\/candidates\/\d+$/.test(p)&&m==='GET'){
    await ensureCandidateSchema(env);
    const id=Number(p.split('/').pop());
    const c=await env.JOB_DB.prepare(`SELECT u.id,p.first_name,p.last_name,p.profession,p.professional_title,p.activity_domain,p.specialty,p.other_skills,p.experience_level,p.experience_years,p.current_situation,p.skills,p.description,p.city,p.country,p.availability,p.target_position,p.target_domain,p.desired_contracts,p.desired_city,p.mobility,p.accepts_travel,p.photo
      FROM users u JOIN candidate_profiles p ON p.user_id=u.id
      WHERE u.id=? AND u.role='candidate' AND u.status='active'
      AND EXISTS(SELECT 1 FROM subscriptions s WHERE s.user_id=u.id AND s.status='active' AND s.plan IN ('standard','business') AND datetime(s.expires_at)>datetime('now'))`).bind(id).first();
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
    const b=await req.json().catch(()=>({}));
    try{
      await env.JOB_DB.batch([
        env.JOB_DB.prepare('INSERT INTO recruitment_requests(recruiter_id,candidate_id,message) VALUES(?,?,?)').bind(s.user.id,candidateId,safeText(b.message,1200)),
        env.JOB_DB.prepare("INSERT INTO notifications(user_id,type,title,content) VALUES(?, 'recruitment','Nouvelle proposition de recrutement','Un recruteur souhaite entrer en contact avec vous pour une opportunité.')").bind(candidateId)
      ]);
      return json({ok:true},201);
    }catch{return json({error:'Vous avez déjà envoyé une demande de recrutement à ce candidat.'},409);}
  }
  if(p==='/api/candidate/recruitment-requests'&&m==='GET'){
    const s=await requireSession(req,env); if(s.user.role!=='candidate') return json({error:'Réservé aux demandeurs d’emploi.'},403);
    await ensureRecruitmentSchema(env);
    const rows=await env.JOB_DB.prepare(`SELECT rr.*,r.company_name,r.trade_name,r.job_title,u.email
      FROM recruitment_requests rr JOIN users u ON u.id=rr.recruiter_id LEFT JOIN recruiter_profiles r ON r.user_id=rr.recruiter_id
      WHERE rr.candidate_id=? ORDER BY rr.id DESC`).bind(s.user.id).all();
    return json({requests:rows.results||[]});
  }
  if(p==='/api/candidate/applications'&&m==='GET'){
    const s=await requireSession(req,env); if(s.user.role!=='candidate') return json({error:'Réservé aux demandeurs d’emploi.'},403);
    const rows=await env.JOB_DB.prepare(`SELECT a.id,a.status,a.message,a.created_at,a.updated_at,j.id job_id,j.title,j.location,j.employment_type,j.salary,r.company_name
      FROM applications a JOIN jobs j ON j.id=a.job_id LEFT JOIN recruiter_profiles r ON r.user_id=j.recruiter_id
      WHERE a.candidate_id=? ORDER BY a.id DESC`).bind(s.user.id).all();
    return json({applications:rows.results||[]});
  }
  if(/^\/api\/recruiter\/applications\/\d+\/status$/.test(p)&&m==='POST'){
    const s=await requireSession(req,env); if(s.user.role!=='recruiter') return json({error:'Réservé aux recruteurs.'},403);
    const id=Number(p.split('/')[4]), b=await req.json().catch(()=>({}));
    const status=['submitted','reviewing','accepted','rejected'].includes(b.status)?b.status:null;
    if(!status) return json({error:'Statut invalide.'},400);
    const row=await env.JOB_DB.prepare(`SELECT a.candidate_id,j.title FROM applications a JOIN jobs j ON j.id=a.job_id WHERE a.id=? AND j.recruiter_id=?`).bind(id,s.user.id).first();
    if(!row) return json({error:'Candidature introuvable.'},404);
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
  if(/^\/api\/recruiter\/jobs\/\d+\/status$/.test(p)&&m==='POST'){
    const s=await requireSession(req,env); if(s.user.role!=='recruiter') return json({error:'Réservé aux recruteurs.'},403);
    const id=Number(p.split('/')[4]), b=await req.json().catch(()=>({}));
    const status=['published','draft','suspended','closed'].includes(b.status)?b.status:null;
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
  if(p==='/api/messages'&&m==='GET'){
    const s=await requireSession(req,env); const cid=Number(url.searchParams.get('conversation_id')); const member=await env.JOB_DB.prepare('SELECT 1 FROM conversation_members WHERE conversation_id=? AND user_id=?').bind(cid,s.user.id).first(); if(!member) return json({error:'Accès interdit.'},403); const rows=await env.JOB_DB.prepare('SELECT id,sender_id,content,read_at,created_at FROM messages WHERE conversation_id=? ORDER BY id ASC LIMIT 300').bind(cid).all(); return json({messages:rows.results});
  }
  if(p==='/api/messages'&&m==='POST'){
    const s=await requireSession(req,env), b=await req.json(); const receiver=Number(b.receiver_id), content=safeText(b.content,2500); if(!receiver||!content||receiver===s.user.id) return json({error:'Message invalide.'},400);
    const c=await env.JOB_DB.prepare(`SELECT cm1.conversation_id id FROM conversation_members cm1 JOIN conversation_members cm2 ON cm1.conversation_id=cm2.conversation_id WHERE cm1.user_id=? AND cm2.user_id=? LIMIT 1`).bind(s.user.id,receiver).first(); let cid=c?.id;
    if(!cid){ const cr=await env.JOB_DB.prepare('INSERT INTO conversations DEFAULT VALUES RETURNING id').first(); cid=cr.id; await env.JOB_DB.batch([env.JOB_DB.prepare('INSERT INTO conversation_members(conversation_id,user_id) VALUES(?,?)').bind(cid,s.user.id),env.JOB_DB.prepare('INSERT INTO conversation_members(conversation_id,user_id) VALUES(?,?)').bind(cid,receiver)]); }
    await env.JOB_DB.prepare('INSERT INTO messages(conversation_id,sender_id,content) VALUES(?,?,?)').bind(cid,s.user.id,content).run(); await env.JOB_DB.prepare("INSERT INTO notifications(user_id,type,title,content) VALUES(?, 'message','Nouveau message','Vous avez reçu un nouveau message.')").bind(receiver).run(); return json({ok:true,conversation_id:cid},201);
  }
  if(p==='/api/conversations'&&m==='GET'){
    const s=await requireSession(req,env);
    const rows=await env.JOB_DB.prepare(`SELECT c.id,c.updated_at,
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
  if(p==='/api/notifications'&&m==='GET'){ const s=await requireSession(req,env); const rows=await env.JOB_DB.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100').bind(s.user.id).all(); return json({notifications:rows.results}); }

  if(p==='/api/admin/subscription-requests'&&m==='GET'){ await requireAdmin(req,env); const rows=await env.JOB_DB.prepare(`SELECT sr.*,u.email,u.role FROM subscription_requests sr JOIN users u ON u.id=sr.user_id WHERE sr.status='pending' ORDER BY sr.id DESC`).all(); return json({requests:rows.results}); }
  if(/^\/api\/admin\/subscription-requests\/\d+\/(approve|reject)$/.test(p)&&m==='POST'){
    const s=await requireAdmin(req,env), parts=p.split('/'), id=Number(parts[4]), action=parts[5]; const r=await env.JOB_DB.prepare("SELECT * FROM subscription_requests WHERE id=? AND status='pending'").bind(id).first(); if(!r) return json({error:'Demande introuvable.'},404);
    if(action==='approve'){
      const days=r.plan==='business'?365:30; await env.JOB_DB.batch([
        env.JOB_DB.prepare("UPDATE subscriptions SET status='expired',updated_at=? WHERE user_id=? AND status='active'").bind(nowISO(),r.user_id),
        env.JOB_DB.prepare("INSERT INTO subscriptions(user_id,plan,started_at,expires_at,status) VALUES(?,?,?,?, 'active')").bind(r.user_id,r.plan,nowISO(),addDays(days)),
        env.JOB_DB.prepare("UPDATE subscription_requests SET status='approved',admin_id=?,processed_at=? WHERE id=?").bind(s.user.id,nowISO(),id),
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
  if(p==='/api/account'&&m==='DELETE'){
    const s=await requireSession(req,env);
    const uid=s.user.id;
    await deleteUserAndRelatedData(env,uid);
    await env.JOB_KV.delete(`sess:${s.token}`);
    return json({ok:true},200,{'set-cookie':clearCookie()});
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
    await requireAdmin(req,env);
    const rows=await env.JOB_DB.prepare(`SELECT j.*,u.email recruiter_email,r.company_name,
      (SELECT COUNT(*) FROM applications a WHERE a.job_id=j.id) application_count
      FROM jobs j JOIN users u ON u.id=j.recruiter_id LEFT JOIN recruiter_profiles r ON r.user_id=j.recruiter_id
      ORDER BY j.id DESC LIMIT 500`).all();
    return json({jobs:rows.results||[]});
  }
  if(/^\/api\/admin\/jobs\/\d+$/.test(p)&&m==='DELETE'){
    const s=await requireAdmin(req,env),id=Number(p.split('/').pop());
    await audit(env,s.user.id,'ADMIN_JOB_DELETE','job',id);
    await env.JOB_DB.prepare('DELETE FROM jobs WHERE id=?').bind(id).run();
    return json({ok:true});
  }
  if(p==='/api/admin/applications'&&m==='GET'){
    await requireAdmin(req,env);
    const rows=await env.JOB_DB.prepare(`SELECT a.id,a.status,a.created_at,j.title,
      cu.email candidate_email,ru.email recruiter_email,r.company_name
      FROM applications a JOIN jobs j ON j.id=a.job_id
      JOIN users cu ON cu.id=a.candidate_id JOIN users ru ON ru.id=j.recruiter_id
      LEFT JOIN recruiter_profiles r ON r.user_id=ru.id ORDER BY a.id DESC LIMIT 500`).all();
    return json({applications:rows.results||[]});
  }
  if(p==='/api/admin/audit-logs'&&m==='GET'){
    await requireAdmin(req,env);
    const rows=await env.JOB_DB.prepare(`SELECT a.*,u.email actor_email FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.id DESC LIMIT 300`).all();
    return json({logs:rows.results||[]});
  }
  if(p==='/api/admin/subscription-history'&&m==='GET'){
    await requireAdmin(req,env);
    const rows=await env.JOB_DB.prepare(`SELECT s.*,u.email,u.role FROM subscriptions s JOIN users u ON u.id=s.user_id ORDER BY s.id DESC LIMIT 500`).all();
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
    if(!plan||days<1||days>730) return json({error:'Formule ou durée invalide.'},400);
    await env.JOB_DB.batch([
      env.JOB_DB.prepare("UPDATE subscriptions SET status='expired',updated_at=? WHERE user_id=? AND status='active'").bind(nowISO(),id),
      env.JOB_DB.prepare("INSERT INTO subscriptions(user_id,plan,started_at,expires_at,status) VALUES(?,?,?,?, 'active')").bind(id,plan,nowISO(),addDays(days)),
      env.JOB_DB.prepare("INSERT INTO notifications(user_id,type,title,content) VALUES(?,'subscription','Abonnement modifié par GLOBAL EMPLOI',?)").bind(id,`Votre formule est maintenant ${plan.toUpperCase()} pour ${days} jour(s).`)
    ]);
    await audit(env,s.user.id,'ADMIN_SUBSCRIPTION_CHANGED','user',id,{plan,days});
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
    await requireAdmin(req,env);
    const status=safeText(url.searchParams.get('status'),30);
    const rows=await env.JOB_DB.prepare(`SELECT sr.*,u.email,u.role,a.email admin_email
      FROM subscription_requests sr JOIN users u ON u.id=sr.user_id
      LEFT JOIN users a ON a.id=sr.admin_id
      WHERE (?='' OR sr.status=?)
      ORDER BY sr.id DESC LIMIT 500`).bind(status,status).all();
    return json({requests:rows.results||[]});
  }
  if(p==='/api/admin/recruiter-verifications/all'&&m==='GET'){
    await requireAdmin(req,env); await ensureRecruiterSchema(env);
    const rows=await env.JOB_DB.prepare(`SELECT r.user_id,r.first_name,r.last_name,r.job_title,r.company_name,r.organization_type,r.sector,r.company_city,
      r.verification_status,r.verification_note,r.updated_at,u.email,u.phone
      FROM recruiter_profiles r JOIN users u ON u.id=r.user_id
      ORDER BY CASE r.verification_status WHEN 'pending' THEN 0 WHEN 'unverified' THEN 1 ELSE 2 END,r.updated_at DESC LIMIT 500`).all();
    return json({recruiters:rows.results||[]});
  }
  if(/^\/api\/admin\/jobs\/\d+\/status$/.test(p)&&m==='POST'){
    const s=await requireAdmin(req,env),id=Number(p.split('/')[4]),b=await req.json().catch(()=>({}));
    const status=['published','draft','suspended','closed'].includes(b.status)?b.status:null;
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
  if(p==='/api/support/messages'&&m==='GET'){
    const s=await requireSession(req,env); await ensureAdminModuleSchema(env);
    let rows;
    if(s.user.role==='super_admin'){
      rows=await env.JOB_DB.prepare(`SELECT sm.*,su.email sender_email,ru.email recipient_email FROM support_messages sm
        LEFT JOIN users su ON su.id=sm.sender_user_id LEFT JOIN users ru ON ru.id=sm.recipient_user_id
        ORDER BY sm.id DESC LIMIT 300`).all();
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
  if(p==='/api/admin/users'&&m==='GET'){ await requireAdmin(req,env); const rows=await env.JOB_DB.prepare(`SELECT u.id,u.email,u.phone,u.role,u.status,u.created_at,s.plan,s.expires_at FROM users u LEFT JOIN subscriptions s ON s.id=(SELECT id FROM subscriptions WHERE user_id=u.id ORDER BY datetime(expires_at) DESC LIMIT 1) ORDER BY u.id DESC LIMIT 500`).all(); return json({users:rows.results}); }
  return json({error:'Route API introuvable.'},404);
}

export default {
  async fetch(request, env){
    const url=new URL(request.url);
    try{
      assertBindings(env);
      if(url.pathname.startsWith('/api/')){
        if(url.pathname!=='/api/health'){
          await checkDatabase(env);
          await cleanupExpiredFreeAccounts(env);
        }
        return await api(request,env,url);
      }
      return env.ASSETS.fetch(request);
    } catch(err){
      if(err instanceof Response) return err;
      const requestId=request.headers.get('cf-ray')||crypto.randomUUID();
      console.error('GLOBAL_EMPLOI_SERVER_ERROR',{requestId,code:err?.code||'SERVER_ERROR',message:err?.message||String(err),stack:err?.stack});
      const code=err?.code||'SERVER_ERROR';
      const message=err?.publicMessage||'Erreur serveur. Consultez les journaux Cloudflare avec la référence indiquée.';
      return json({error:message,code,reference:requestId},500);
    }
  }
};
