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

async function handleRegister(req,env){
  const b=await req.json().catch(()=>({})); const role=b.role==='recruiter'?'recruiter':'candidate';
  const email=safeText(b.email,190).toLowerCase(), password=String(b.password||''), phone=safeText(b.phone,40);
  if(!validEmail(email)||password.length<8) return json({error:'E-mail invalide ou mot de passe trop court.'},400);
  const exists=await env.JOB_DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first(); if(exists) return json({error:'Ce compte existe déjà.'},409);
  let userId=null;
  try{
    const p=await createPassword(password);
    const ins=await env.JOB_DB.prepare('INSERT INTO users(email,phone,password_hash,password_salt,role) VALUES(?,?,?,?,?)').bind(email,phone,p.hash,p.salt,role).run();
    userId=Number(ins?.meta?.last_row_id);
    if(!userId) throw new Error('User insert did not return last_row_id');
    if(role==='candidate') await env.JOB_DB.prepare('INSERT INTO candidate_profiles(user_id,first_name,last_name,profession,city) VALUES(?,?,?,?,?)').bind(userId,safeText(b.first_name,100),safeText(b.last_name,100),safeText(b.profession,150),safeText(b.city,120)).run();
    else await env.JOB_DB.prepare('INSERT INTO recruiter_profiles(user_id,recruiter_type,company_name,activity,city) VALUES(?,?,?,?,?)').bind(userId,safeText(b.recruiter_type,80),safeText(b.company_name,180),safeText(b.activity,180),safeText(b.city,120)).run();
    const expires=role==='candidate'?addDays(7):new Date(Date.now()+24*3600*1000).toISOString();
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
    return json({ok:true,service:'GLOBAL EMPLOI',d1:'ok',kv:'ok',assets:'ok'});
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
    const s=await requireSession(req,env); const table=s.user.role==='recruiter'?'recruiter_profiles':'candidate_profiles'; const row=await env.JOB_DB.prepare(`SELECT * FROM ${table} WHERE user_id=?`).bind(s.user.id).first(); return json({profile:row,subscription:await currentSubscription(env,s.user.id)});
  }
  if((p==='/api/profile'||p==='/api/save')&&m==='POST'){
    const s=await requireSession(req,env), b=await req.json().catch(()=>({}));
    if(s.user.role==='candidate') await env.JOB_DB.prepare(`UPDATE candidate_profiles SET first_name=?,last_name=?,profession=?,specialty=?,city=?,location=?,education=?,experience_years=?,skills=?,description=?,availability=?,work_types=?,updated_at=? WHERE user_id=?`).bind(safeText(b.first_name,100),safeText(b.last_name,100),safeText(b.profession,150),safeText(b.specialty,150),safeText(b.city,120),safeText(b.location,180),safeText(b.education,180),Number(b.experience_years||0),safeText(b.skills,1200),safeText(b.description,2500),safeText(b.availability,100),safeText(b.work_types,500),nowISO(),s.user.id).run();
    else if(s.user.role==='recruiter') await env.JOB_DB.prepare(`UPDATE recruiter_profiles SET recruiter_type=?,company_name=?,activity=?,description=?,city=?,address=?,updated_at=? WHERE user_id=?`).bind(safeText(b.recruiter_type,80),safeText(b.company_name,180),safeText(b.activity,180),safeText(b.description,2500),safeText(b.city,120),safeText(b.address,250),nowISO(),s.user.id).run();
    else return json({error:'Profil non applicable.'},400); return json({ok:true});
  }
  if(p==='/api/subscription-request'&&m==='POST'){
    const s=await requireSession(req,env), b=await req.json(); const plan=b.plan==='business'?'business':'standard', amount=plan==='business'?10000:1000; const sub=await currentSubscription(env,s.user.id);
    if(sub && sub.plan!=='free' && sub.effective_status==='active') return json({error:'Vous avez déjà un abonnement payant valide.'},409);
    const pending=await env.JOB_DB.prepare("SELECT id FROM subscription_requests WHERE user_id=? AND status='pending'").bind(s.user.id).first(); if(pending) return json({error:'Une demande est déjà en attente.'},409);
    const payer=safeText(b.payer_phone,40), tx=safeText(b.transaction_id,120); if(!payer||!tx) return json({error:'Téléphone et ID transaction obligatoires.'},400);
    await env.JOB_DB.prepare('INSERT INTO subscription_requests(user_id,plan,amount,payer_phone,transaction_id) VALUES(?,?,?,?,?)').bind(s.user.id,plan,amount,payer,tx).run(); await audit(env,s.user.id,'SUBSCRIPTION_REQUEST','subscription',null,{plan,amount}); return json({ok:true});
  }
  if(p==='/api/jobs'&&m==='GET'){
    const rows=await env.JOB_DB.prepare("SELECT j.*, r.company_name FROM jobs j LEFT JOIN recruiter_profiles r ON r.user_id=j.recruiter_id WHERE j.status='published' ORDER BY j.id DESC LIMIT 100").all(); return json({jobs:rows.results});
  }
  if(p==='/api/jobs'&&m==='POST'){
    const s=await requireSession(req,env); if(s.user.role!=='recruiter') return json({error:'Réservé aux recruteurs.'},403); const b=await req.json(); if(!b.title||!b.description) return json({error:'Titre et description obligatoires.'},400);
    const r=await env.JOB_DB.prepare('INSERT INTO jobs(recruiter_id,title,profession,category,description,employment_type,location,salary,vacancies,status,starts_at,closes_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id').bind(s.user.id,safeText(b.title,180),safeText(b.profession,150),safeText(b.category,150),safeText(b.description,4000),safeText(b.employment_type,100),safeText(b.location,180),safeText(b.salary,100),Number(b.vacancies||1),'published',safeText(b.starts_at,40)||null,safeText(b.closes_at,40)||null).first(); return json({ok:true,id:r.id},201);
  }
  if(/^\/api\/jobs\/\d+\/apply$/.test(p)&&m==='POST'){
    const s=await requireSession(req,env); if(s.user.role!=='candidate') return json({error:'Réservé aux candidats.'},403); const jobId=Number(p.split('/')[3]); const b=await req.json().catch(()=>({})); try{await env.JOB_DB.prepare('INSERT INTO applications(job_id,candidate_id,message) VALUES(?,?,?)').bind(jobId,s.user.id,safeText(b.message,1200)).run(); return json({ok:true},201);}catch{return json({error:'Candidature déjà envoyée ou offre invalide.'},409);}
  }
  if(p==='/api/candidates'&&m==='GET'){
    await requireSession(req,env); const rows=await env.JOB_DB.prepare(`SELECT u.id,p.first_name,p.last_name,p.profession,p.specialty,p.city,p.experience_years,p.skills,p.availability FROM users u JOIN candidate_profiles p ON p.user_id=u.id WHERE u.status='active' ORDER BY u.id DESC LIMIT 100`).all(); return json({candidates:rows.results});
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
    const s=await requireSession(req,env); const rows=await env.JOB_DB.prepare(`SELECT c.id,c.updated_at,(SELECT content FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) last_message FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id WHERE cm.user_id=? ORDER BY c.updated_at DESC`).bind(s.user.id).all(); return json({conversations:rows.results});
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
  if(p==='/api/admin/users'&&m==='GET'){ await requireAdmin(req,env); const rows=await env.JOB_DB.prepare(`SELECT u.id,u.email,u.phone,u.role,u.status,u.created_at,s.plan,s.expires_at FROM users u LEFT JOIN subscriptions s ON s.id=(SELECT id FROM subscriptions WHERE user_id=u.id ORDER BY datetime(expires_at) DESC LIMIT 1) ORDER BY u.id DESC LIMIT 500`).all(); return json({users:rows.results}); }
  return json({error:'Route API introuvable.'},404);
}

export default {
  async fetch(request, env){
    const url=new URL(request.url);
    try{
      assertBindings(env);
      if(url.pathname.startsWith('/api/')){
        if(url.pathname!=='/api/health') await checkDatabase(env);
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
