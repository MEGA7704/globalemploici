const $=(s)=>document.querySelector(s), $$=(s)=>[...document.querySelectorAll(s)];
const state={session:null,view:'home',freeTimer:null};
const asList=v=>Array.isArray(v)?v:[];
const api=async(path,options={})=>{
  const method=String(options.method||'GET').toUpperCase();
  let requestPath=path;
  if(method==='GET'){
    const sep=requestPath.includes('?')?'&':'?';
    requestPath+=`${sep}_fresh=${Date.now()}`;
  }
  const controller=new AbortController();
  const timeoutMs=Number(options.timeoutMs||20000);
  const timer=setTimeout(()=>controller.abort('timeout'),timeoutMs);
  try{
    const {timeoutMs:_ignored,...fetchOptions}=options;
    const r=await fetch(requestPath,{cache:'no-store',headers:{'content-type':'application/json','cache-control':'no-cache',...(fetchOptions.headers||{})},...fetchOptions,signal:fetchOptions.signal||controller.signal});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){
      const e=new Error(d.error||`Erreur HTTP ${r.status}`);
      e.code=d.code||`HTTP_${r.status}`;
      e.reference=d.reference||'';
      e.detail=d.detail||'';
      throw e;
    }
    return d;
  }catch(err){
    if(err?.name==='AbortError' || controller.signal.aborted){
      const e=new Error('Le serveur met trop de temps à répondre. Réessayez.');
      e.code='REQUEST_TIMEOUT';
      throw e;
    }
    throw err;
  }finally{clearTimeout(timer);}
};
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),3200)}
function modal(html){$('#modalBody').innerHTML=html;$('#modal').classList.remove('hidden')}
function closeModal(){$('#modal').classList.add('hidden')}
$('#closeModal').onclick=closeModal;$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});

// V28 — utilitaire central d'échappement HTML. La V27 l'appelait partout sans le définir,
// ce qui interrompait les clics dès qu'une liste ou un détail devait être rendu.
function esc(value){
  return String(value??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[ch]);
}

// V28 — formulaire d'inscription réellement défini. La V27 appelait registerModal()
// depuis plusieurs boutons sans jamais fournir la fonction.
function registrationFeedback(message='',type='error'){
  const box=$('#registerFeedback');
  if(!box) return;
  box.textContent=message;
  box.className=`form-feedback ${message?'':'hidden'} ${type}`;
}
function validateRegistrationForm(form,isCandidate){
  const get=name=>form.elements.namedItem(name);
  const required=[
    ['last_name','Veuillez saisir votre nom.'],
    ['first_name','Veuillez saisir vos prénoms.'],
    ...(isCandidate?[
      ['birth_date','Veuillez saisir votre date de naissance.'],
      ['nationality','Veuillez saisir votre nationalité.'],
      ['city','Veuillez saisir votre ville de résidence.']
    ]:[['job_title','Veuillez saisir votre fonction ou votre poste.']]),
    ['country','Veuillez saisir votre pays.'],
    ['phone','Veuillez saisir votre numéro de téléphone.'],
    ['email','Veuillez saisir votre adresse e-mail.'],
    ['password','Veuillez saisir un mot de passe.']
  ];
  for(const [name,message] of required){
    const el=get(name);
    if(!el || !String(el.value||'').trim()) return {ok:false,el,message};
  }
  const email=get('email');
  if(email && !email.checkValidity()) return {ok:false,el:email,message:'Veuillez saisir une adresse e-mail valide.'};
  const password=get('password');
  if(password && String(password.value||'').length<8) return {ok:false,el:password,message:'Le mot de passe doit contenir au moins 8 caractères.'};
  const terms=get('terms');
  if(!terms?.checked) return {ok:false,el:terms,message:'Veuillez accepter les conditions d’utilisation.'};
  if(!isCandidate){
    const privacy=get('privacy');
    if(!privacy?.checked) return {ok:false,el:privacy,message:'Veuillez accepter la politique de confidentialité.'};
  }
  return {ok:true};
}
async function submitRegistrationForm(form,role){
  const isCandidate=role==='candidate';
  registrationFeedback('');
  const validation=validateRegistrationForm(form,isCandidate);
  if(!validation.ok){
    registrationFeedback(validation.message,'error');
    validation.el?.focus?.();
    validation.el?.scrollIntoView?.({block:'center',behavior:'smooth'});
    return;
  }
  const submit=form.querySelector('[type="submit"]');
  const oldText=submit?.textContent||'';
  if(submit){submit.disabled=true;submit.setAttribute('aria-busy','true');submit.textContent='Création du compte…';}
  const fd=new FormData(form),payload=Object.fromEntries(fd.entries());
  payload.role=role;
  payload.terms=fd.has('terms');
  payload.privacy=isCandidate?true:fd.has('privacy');
  try{
    const result=await api('/api/register',{method:'POST',body:JSON.stringify(payload),timeoutMs:20000});
    // L'inscription est terminée dès que /api/register répond 201.
    // Ne jamais bloquer la fermeture du formulaire sur boot()/session ou sur le chargement d'une autre page.
    closeModal();
    toast('Compte créé avec succès. Ouverture de votre espace…');
    Promise.race([
      boot(),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('post-register boot timeout')),8000))
    ]).catch(bootErr=>{
      console.error('GLOBAL_EMPLOI_POST_REGISTER_BOOT_ERROR',bootErr);
      toast('Compte créé avec succès. Si votre espace ne s’ouvre pas, utilisez « Se connecter ».');
    });
    return result;
  }catch(err){
    const suffix=[err.code?`Code ${err.code}`:'',err.reference?`Réf. ${err.reference}`:''].filter(Boolean).join(' • ');
    registrationFeedback(`${err.message||'Impossible de créer le compte.'}${suffix?` • ${suffix}`:''}`,'error');
    console.error('GLOBAL_EMPLOI_REGISTER_CLIENT_ERROR',err);
  }finally{
    if(submit){submit.disabled=false;submit.removeAttribute('aria-busy');submit.textContent=oldText;}
  }
}

// V29 — inscription robuste : soumission JS + POST natif de secours, validation visible
// et état explicite du bouton pendant l'enregistrement.
function registerModal(initialRole='candidate'){
  let role=initialRole==='recruiter'?'recruiter':'candidate';
  const render=()=>{
    const candidate=role==='candidate';
    modal(`<div class="registration-modal">
      <span class="section-kicker">CRÉER UN COMPTE</span>
      <h2>${candidate?'Demandeur d’emploi':'Recruteur / Entreprise'}</h2>
      <p class="muted">Créez votre compte GLOBAL EMPLOI. La consultation reste disponible en FREE ; les actions professionnelles nécessitent STANDARD ou BUSINESS.</p>
      <div class="tabs registration-role-tabs">
        <button type="button" class="tab ${candidate?'active':''}" data-register-role="candidate">Je cherche un emploi</button>
        <button type="button" class="tab ${!candidate?'active':''}" data-register-role="recruiter">Je recrute</button>
      </div>
      <form id="registerForm" class="form-grid" method="post" action="/api/register" autocomplete="on" novalidate>
        <input type="hidden" name="role" value="${role}">
        <div id="registerFeedback" class="form-feedback hidden full" role="alert" aria-live="polite"></div>
        <div class="field"><label>Nom *</label><input name="last_name" required autocomplete="family-name"></div>
        <div class="field"><label>Prénoms *</label><input name="first_name" required autocomplete="given-name"></div>
        ${candidate?`
          <div class="field"><label>Date de naissance *</label><input name="birth_date" type="date" required></div>
          <div class="field"><label>Nationalité *</label><input name="nationality" value="Ivoirienne" required></div>
          <div class="field"><label>Ville de résidence *</label><input name="city" placeholder="Ex. Abidjan, Bouaké, Diabo…" required></div>
          <div class="field"><label>Pays *</label><input name="country" value="Côte d’Ivoire" required></div>
        `:`
          <div class="field full"><label>Fonction / Poste *</label><input name="job_title" placeholder="Ex. Responsable RH, Directeur, Gérant…" required></div>
          <div class="field"><label>Ville</label><input name="city" placeholder="Ex. Abidjan, Bouaké…"></div>
          <div class="field"><label>Pays *</label><input name="country" value="Côte d’Ivoire" required></div>
        `}
        <div class="field"><label>Téléphone *</label><input name="phone" type="tel" autocomplete="tel" required></div>
        <div class="field"><label>WhatsApp</label><input name="whatsapp" type="tel"></div>
        <div class="field full"><label>E-mail *</label><input name="email" type="email" autocomplete="username" required></div>
        <div class="field full"><label>Mot de passe *</label><div class="password-wrap"><input id="registerPassword" name="password" type="password" minlength="8" autocomplete="new-password" required><button class="password-toggle" type="button" data-toggle-password="registerPassword" aria-label="Afficher le mot de passe">◉</button></div><small>8 caractères minimum.</small></div>
        <label class="check-row full"><input type="checkbox" name="terms" value="1" required> J’accepte les conditions d’utilisation.</label>
        ${candidate?'':`<label class="check-row full"><input type="checkbox" name="privacy" value="1" required> J’accepte la politique de confidentialité.</label>`}
        <div class="full"><button id="registerSubmit" class="btn primary big" type="submit">Créer mon compte ${candidate?'demandeur':'recruteur'}</button></div>
      </form>
      <p class="centered-login">Déjà inscrit ? <button type="button" class="link-btn" id="openLoginFromRegister">Se connecter</button></p>
    </div>`);
    bindPasswordToggles();
    $$('[data-register-role]').forEach(btn=>btn.onclick=()=>{
      const next=btn.dataset.registerRole;
      if(next!==role){role=next;render();}
    });
    $('#openLoginFromRegister')?.addEventListener('click',loginModal);
    const form=$('#registerForm');
    if(form){
      form.addEventListener('submit',async e=>{
        e.preventDefault();
        e.stopPropagation();
        await submitRegistrationForm(form,role);
      });
    }
  };
  render();
}


function bindPasswordToggles(root=document){
  root.querySelectorAll('[data-toggle-password]').forEach(btn=>{
    if(btn.dataset.bound==='1') return;
    btn.dataset.bound='1';
    btn.addEventListener('click',()=>{
      const input=document.getElementById(btn.dataset.togglePassword);
      if(!input) return;
      const show=input.type==='password';
      input.type=show?'text':'password';
      btn.textContent=show?'◉̸':'◉';
      btn.setAttribute('aria-label',show?'Masquer le mot de passe':'Afficher le mot de passe');
    });
  });
}
async function superAdminRecoveryModal(){
  let status={configured:false,exists:false,active:false};
  try{status=await api('/api/admin-recovery/status')}catch{}
  modal(`<div class="admin-recovery-box">
    <span class="section-kicker">SÉCURITÉ SUPER ADMIN</span>
    <h2>Initialiser / Récupérer le Super Admin</h2>
    <p class="muted">Cette procédure utilise uniquement les Secrets Cloudflare. Aucun mot de passe n’est affiché dans le navigateur.</p>
    <div class="recovery-status ${status.configured?'ok':'warn'}">
      <b>Configuration Cloudflare :</b> ${status.configured?'Secrets requis détectés ✓':'Secrets incomplets'}
      <br><b>Compte Super Admin :</b> ${status.exists?(status.active?'Présent et actif ✓':'Présent mais inactif'):'Absent'}
    </div>
    <form id="adminRecoveryForm" class="form-grid">
      <div class="field full">
        <label>Adresse e-mail Super Admin *</label>
        <input name="email" type="email" placeholder="Doit correspondre à SUPER_ADMIN_EMAIL" required>
      </div>
      <div class="field full">
        <label>Jeton de récupération *</label>
        <div class="password-wrap">
          <input id="adminRecoveryToken" name="recovery_token" type="password" autocomplete="off" required>
          <button class="password-toggle" type="button" data-toggle-password="adminRecoveryToken" aria-label="Afficher le jeton">◉</button>
        </div>
        <small>Utilisez la valeur du Secret Cloudflare SUPER_ADMIN_RECOVERY_TOKEN.</small>
      </div>
      <div class="full recovery-warning">
        <b>Important :</b> le compte sera recréé ou restauré avec le mot de passe actuellement enregistré dans le Secret <code>SUPER_ADMIN_PASSWORD</code>. Les anciennes sessions seront invalidées.
      </div>
      <div class="full"><button class="btn primary" type="submit">Récupérer le Super Admin</button></div>
    </form>
    <div class="recovery-help">
      <b>Secrets requis :</b><br>
      SUPER_ADMIN_EMAIL<br>
      SUPER_ADMIN_PASSWORD<br>
      SUPER_ADMIN_RECOVERY_TOKEN<br>
      SESSION_SECRET
    </div>
  </div>`);
  bindPasswordToggles();
  const form=$('#adminRecoveryForm');
  if(form){
    form.onsubmit=async e=>{
      e.preventDefault();
      const data=Object.fromEntries(new FormData(e.target));
      try{
        const r=await api('/api/admin-recovery/recover',{method:'POST',body:JSON.stringify(data)});
        toast(r.message||'Super Admin récupéré.');
        setTimeout(()=>loginModal(),700);
      }catch(err){toast(err.message)}
    };
  }
}

function loginModal(){
  modal(`<h2>Connexion</h2><p class="muted">Accédez à votre espace GLOBAL EMPLOI.</p>
    <form id="loginForm" class="form-grid" method="post" action="/api/login" autocomplete="on">
      <div class="field full"><label>E-mail</label><input name="email" type="email" autocomplete="username" required></div>
      <div class="field full"><label>Mot de passe</label><div class="password-wrap"><input id="loginPassword" name="password" type="password" autocomplete="current-password" required><button class="password-toggle" type="button" data-toggle-password="loginPassword" aria-label="Afficher le mot de passe">◉</button></div></div>
      <div class="full"><button class="btn primary" type="submit">Se connecter</button></div>
    </form>`);
  bindPasswordToggles();
  $('#loginForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{await api('/api/login',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});closeModal();await boot();toast('Connexion réussie');}catch(err){toast(err.message)}}
}

$('#loginBtn').onclick=loginModal;$('#registerBtn').onclick=()=>registerModal();
function handleRoleEntry(wanted){
  if(wanted!=='candidate'&&wanted!=='recruiter')return;
  if(!state.session){registerModal(wanted);return;}
  const role=state.session.user.role;
  if(wanted==='candidate'){
    if(role==='candidate'){
      if(!hasActivePaidPlan()){
        navigateView('subscription');
        toast('Votre compte FREE peut consulter les offres. Activez STANDARD ou BUSINESS pour utiliser les actions professionnelles.');
        return;
      }
      openPublicPage('jobs');return;
    }
    // Recruteurs et Super Admin peuvent consulter librement les offres publiques.
    openPublicPage('jobs');return;
  }
  if(role==='recruiter'){
    if(!hasActivePaidPlan()){
      navigateView('subscription');
      toast('Votre compte FREE peut consulter les talents. Activez STANDARD ou BUSINESS pour utiliser les actions professionnelles.');
      return;
    }
    openPublicPage('candidates');return;
  }
  // Demandeurs et Super Admin peuvent consulter librement les talents publics.
  openPublicPage('candidates');
}
document.addEventListener('click',e=>{
  const b=e.target.closest?.('[data-open-register]');
  if(!b)return;
  e.preventDefault();
  handleRoleEntry(b.dataset.openRegister);
});

function bindHomePrimaryActions(){
  const jobs=$('#browseJobsHome'),candidates=$('#browseCandidatesHome');
  if(jobs)jobs.onclick=()=>openPublicPage('jobs');
  if(candidates)candidates.onclick=()=>openPublicPage('candidates');
}

const logout=async()=>{closeAccountMenu();await api('/api/logout',{method:'POST'}).catch(()=>{});location.reload()};
$('#accountLogoutBtn').onclick=logout;
$('#accountBtn').onclick=e=>{e.stopPropagation();toggleAccountMenu()};
document.addEventListener('click',e=>{if(!$('#accountControl')?.contains(e.target))closeAccountMenu()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAccountMenu()});

function toggleAccountMenu(){const menu=$('#accountMenu'),btn=$('#accountBtn');if(!menu||!btn)return;const opening=!menu.classList.contains('open');menu.classList.toggle('open',opening);menu.setAttribute('aria-hidden',String(!opening));btn.setAttribute('aria-expanded',String(opening))}
function closeAccountMenu(){const menu=$('#accountMenu'),btn=$('#accountBtn');if(!menu||!btn)return;menu.classList.remove('open');menu.setAttribute('aria-hidden','true');btn.setAttribute('aria-expanded','false')}
function roleLabel(role){return role==='candidate'?'DEMANDEUR D’EMPLOI':role==='recruiter'?'RECRUTEUR':'SUPER ADMIN'}
function accountItems(role){
  if(role==='recruiter')return [
    ['dashboard','⌂','Tableau de bord'],
    ['profile','▣','Profil entreprise'],
    ['jobs','＋','Publier une offre'],
    ['myjobs','▤','Mes offres'],
    ['applications','✓','Candidatures reçues'],
    ['candidates','♙','Recherche candidats'],
    ['messages','✉','Messages'],
    ['notifications','●','Notifications'],
    ['subscription','◈','Abonnement'],
    ['payments','¤','Paiements'],
    ['settings','⚙','Paramètres']
  ];
  if(role==='candidate')return [
    ['dashboard','⌂','Tableau de bord'],
    ['profile','♙','Mon profil'],
    ['jobs','▣','Offres d’emploi'],
    ['myapplications','✓','Mes candidatures'],
    ['recruitment','★','Propositions reçues'],
    ['candidates','♧','Profils'],
    ['messages','✉','Messages'],
    ['notifications','●','Notifications'],
    ['subscription','◈','Abonnement'],
    ['payments','¤','Paiements'],
    ['settings','⚙','Paramètres']
  ];
  return [
    ['dashboard','⌂','Tableau de bord'],
    ['inbox','●','Demandes & inscriptions'],
    ['members','♙','Membres'],
    ['activations','◈','Activations'],
    ['verifications','✓','Vérifications'],
    ['jobsadmin','▣','Offres'],
    ['applicationsadmin','◆','Candidatures'],
    ['reports','▤','Rapports'],
    ['logs','⌁','Journal'],
    ['messages','✉','Messages'],
    ['settings','⚙','Paramètres']
  ];
}
function buildConnectedTopNav(){
  const box=$('#connectedNavItems');
  if(!box)return;
  if(!state.session){box.innerHTML='';box.classList.add('hidden');return;}
  box.classList.remove('hidden');
  box.innerHTML=accountItems(state.session.user.role).map(([view,icon,label])=>
    `<button class="top-account-link ${state.view===view?'active':''}" type="button" data-top-view="${view}"><span>${icon}</span>${label}</button>`
  ).join('');
  $$('[data-top-view]').forEach(b=>b.onclick=()=>{
    navigateView(b.dataset.topView);
    $('#publicNav')?.classList.remove('open');
    $('#mobileMenuBtn')?.setAttribute('aria-expanded','false');
  });
}
function buildAccountMenu(){const u=state.session?.user;if(!u)return;const role=roleLabel(u.role);$('#accountLabel').textContent='Mon compte';$('#menuAccountEmail').textContent=u.email;$('#menuAccountRole').textContent=role;$('#menuAccountName').textContent=u.email.split('@')[0]||'Mon compte';const nav=$('#accountMenuItems');nav.innerHTML=accountItems(u.role).map(([view,icon,label])=>`<button class="account-menu-link ${state.view===view?'active':''}" type="button" data-account-view="${view}" role="menuitem"><span>${icon}</span><b>${label}</b></button>`).join('');$$('[data-account-view]').forEach(b=>b.onclick=()=>{navigateView(b.dataset.accountView);closeAccountMenu()});loadAccountDisplayName()}
async function loadAccountDisplayName(){try{const d=await api('/api/profile'),p=d.profile||{};const full=[p.first_name,p.last_name].filter(Boolean).join(' ').trim();const company=p.company_name||p.commercial_name||'';const label=company||full;if(label){$('#accountLabel').textContent=label.length>20?label.slice(0,20)+'…':label;$('#menuAccountName').textContent=label}}catch{}}
function syncViewNavigation(view){
  $$('[data-account-view]').forEach(x=>x.classList.toggle('active',x.dataset.accountView===view));
  $$('[data-top-view]').forEach(x=>x.classList.toggle('active',x.dataset.topView===view));
  $('#publicNav a[href="#home"]')?.classList.toggle('active',view==='home');
}
function showPublicHome(anchor='home'){
  state.view='home';
  $('#guestHome').classList.remove('hidden');
  $('#guestHome').classList.add('home-overview');
  $('#app').classList.add('hidden');
  document.querySelectorAll('#guestHome > section').forEach(s=>s.classList.remove('public-page-hidden'));
  syncViewNavigation('home');
  closeAccountMenu();
  history.replaceState(null,'','#home');
  if(anchor){setTimeout(()=>document.getElementById(anchor)?.scrollIntoView({behavior:'smooth',block:'start'}),20)}
}
function navigateView(view){
  if(!state.session)return loginModal();
  buildConnectedTopNav();
  $('#guestHome').classList.add('hidden');
  $('#app').classList.remove('hidden');
  syncViewNavigation(view);
  render(view).catch(err=>{
    console.error('NAVIGATION_RENDER_FAILURE',view,err);
    const c=$('#viewContent');if(c)c.innerHTML=`<div class="panel error-panel"><h3>Erreur de chargement</h3><p>${esc(err.message||'Erreur inconnue')}</p></div>`;
  });
  window.scrollTo({top:0,behavior:'smooth'});
}

function formatCount(n){return new Intl.NumberFormat('fr-FR').format(Number(n||0))}
async function loadPublicStats(){
  try{
    const d=await api('/api/public-stats');
    if($('#realJobsCount'))$('#realJobsCount').textContent=formatCount(d.jobs);
    if($('#realCompaniesCount'))$('#realCompaniesCount').textContent=formatCount(d.companies);
    if($('#realCandidatesCount'))$('#realCandidatesCount').textContent=formatCount(d.candidates);
    if($('#realJobsMove'))$('#realJobsMove').textContent=`+${formatCount(d.movement?.jobs30||0)} sur 30 jours`;
    if($('#realCompaniesMove'))$('#realCompaniesMove').textContent=`+${formatCount(d.movement?.companies30||0)} sur 30 jours`;
    if($('#realCandidatesMove'))$('#realCandidatesMove').textContent=`+${formatCount(d.movement?.candidates30||0)} sur 30 jours`;
  }catch{}
}
async function boot(){
  try{
    state.session=await api('/api/session');
    showConnectedHome();
    scheduleFreePopup();
  }catch(err){
    state.session=null;
    showGuest();
    if(err?.code && err.code!=='HTTP_401'){
      const code=err.code?` • Code ${err.code}`:'';
      const ref=err.reference?` • Réf. ${err.reference}`:'';
      toast(`Connexion aux données impossible : ${err.message}${code}${ref}`);
    }
  }
  applyPublicHashRoute();
}
function showGuest(){
  state.view='home';$('#guestHome').classList.remove('hidden');$('#guestHome').classList.add('home-overview');$('#app').classList.add('hidden');
  document.querySelectorAll('#guestHome > section').forEach(s=>s.classList.remove('public-page-hidden'));
  $('#loginBtn').classList.remove('hidden');$('#registerBtn').classList.remove('hidden');$('#accountControl').classList.add('hidden');
  buildConnectedTopNav();closeAccountMenu();syncViewNavigation('home');loadPublicStats();
}
function showConnectedHome(){
  const u=state.session.user;state.view='home';$('#guestHome').classList.remove('hidden');$('#guestHome').classList.add('home-overview');$('#app').classList.add('hidden');
  document.querySelectorAll('#guestHome > section').forEach(s=>s.classList.remove('public-page-hidden'));
  $('#loginBtn').classList.add('hidden');$('#registerBtn').classList.add('hidden');$('#accountControl').classList.remove('hidden');
  buildAccountMenu();buildConnectedTopNav();updateSubChip();syncViewNavigation('home');loadPublicStats();
}
function updateSubChip(){
  if(state.session?.user?.role==='super_admin'){if($('#subscriptionChip'))$('#subscriptionChip').textContent='SUPER ADMIN • permanent';return}
  const s=state.session.subscription;if(!s){if($('#subscriptionChip'))$('#subscriptionChip').textContent='Aucun abonnement';return}
  if(s.plan==='free'){if($('#subscriptionChip'))$('#subscriptionChip').textContent='FREE • consultation';return}
  const d=new Date(s.expires_at).toLocaleDateString('fr-FR');if($('#subscriptionChip'))$('#subscriptionChip').textContent=`${s.plan.toUpperCase()} • jusqu'au ${d}`;
}
$('#backHomeBtn')?.addEventListener('click',()=>showPublicHome('home'));
async function render(view){
  state.view=view;syncViewNavigation(view);
  const c=$('#viewContent'),t=$('#viewTitle');
  try{
    state.session=await api('/api/session');
    buildAccountMenu();buildConnectedTopNav();updateSubChip();
  }catch(sessionError){
    if(sessionError?.code==='HTTP_401'){
      state.session=null;showGuest();loginModal();return;
    }
    // Ne pas transformer une panne D1/API en fausse déconnexion : la page affiche l'erreur et permet Réessayer.
    throw sessionError;
  }
  const names={
    dashboard:'Tableau de bord',profile:state.session?.user?.role==='recruiter'?'Profil entreprise':'Mon profil',
    jobs:state.session?.user?.role==='recruiter'?'Publier une offre':"Offres d'emploi",
    myjobs:'Mes offres',applications:'Candidatures reçues',myapplications:'Mes candidatures',
    recruitment:'Propositions reçues',candidates:'Profils / Candidats',messages:'Messages',
    notifications:'Notifications',subscription:'Abonnement',payments:'Paiements',settings:'Paramètres',
    inbox:'Demandes & inscriptions',members:'Gestion des membres',activations:'Activations abonnements',verifications:'Vérifications recruteurs',
    jobsadmin:'Gestion des offres',applicationsadmin:'Suivi des candidatures',reports:'Rapports & statistiques',
    logs:'Journal de sécurité'
  };
  t.textContent=names[view]||view;
  c.innerHTML='<div class="page-skeleton" aria-label="Mise à jour"><span></span><span></span><span></span></div>';
  try{
    if(view==='dashboard'){await renderDashboard();return}
    if(view==='profile'){await renderProfile();return}
    if(view==='jobs'){await renderJobs();return}
    if(view==='myjobs'){await renderMyJobs();return}
    if(view==='applications'){await renderRecruiterApplications();return}
    if(view==='myapplications'){await renderMyApplications();return}
    if(view==='recruitment'){await renderRecruitmentRequests();return}
    if(view==='candidates'){await renderCandidates();return}
    if(view==='messages'){await renderMessages();return}
    if(view==='notifications'){await renderNotifications();return}
    if(view==='subscription'){await renderSubscription();return}
    if(view==='payments'){await renderPayments();return}
    if(view==='settings'){await renderSettings();return}
    if(view==='inbox'){await renderAdminInbox();return}
    if(view==='members'){await renderAdminMembers();return}
    if(view==='activations'){await renderAdminActivations();return}
    if(view==='verifications'){await renderAdminVerifications();return}
    if(view==='jobsadmin'){await renderAdminJobs();return}
    if(view==='applicationsadmin'){await renderAdminApplications();return}
    if(view==='reports'){await renderAdminReports();return}
    if(view==='logs'){await renderAdminLogs();return}
    c.innerHTML='<div class="panel">Module indisponible.</div>';
  }catch(e){
    console.error('VIEW_RENDER_ERROR',view,e);
    const ref=e.reference?`<div class="error-reference">Référence : <code>${esc(e.reference)}</code></div>`:'';
    const detail=e.detail?`<div class="error-reference">Détail D1 : <code>${esc(e.detail)}</code></div>`:'';
    c.innerHTML=`<div class="panel error-panel professional-error">
      <div class="error-icon">!</div>
      <div><h3>Impossible de charger cette section</h3><p>${esc(e.message||'Erreur inconnue')}</p>${ref}${detail}
      <div class="error-actions"><button class="btn primary" id="retryView">Réessayer</button><button class="btn outline-blue" id="errorHome">Retour à l’accueil</button></div></div>
    </div>`;
    $('#retryView')?.addEventListener('click',()=>render(view));
    $('#errorHome')?.addEventListener('click',()=>showPublicHome('home'));
  }
}
async function renderDashboard(){
  const u=state.session.user,s=state.session.subscription;
  const m=await api('/api/dashboard-metrics');
  if(u.role==='recruiter'){
    const p=await api('/api/profile');
    const c=p.completeness||{},paid=hasActivePaidPlan();
    const expiry=s?.expires_at?new Date(s.expires_at).toLocaleDateString('fr-FR'):'—';
    $('#viewContent').innerHTML=`
      <section class="role-dashboard recruiter-command-center">
        <div class="dashboard-welcome">
          <div><span class="section-kicker">ESPACE RECRUTEUR</span><h2>Centre de recrutement</h2><p>Suivez vos offres, candidatures, recherches de talents et communications depuis un tableau de bord unique.</p></div>
          <div class="dashboard-plan"><small>ABONNEMENT</small><strong>${esc((s?.plan||'—').toUpperCase())}</strong><span>${paid?'Actif':'Accès limité / publications masquées'} • ${expiry}</span></div>
        </div>
        <div class="recruiter-status-strip">
          <span class="status-badge ${c.verification_status==='verified'?'active':''}">${c.verification_status==='verified'?'Entreprise vérifiée ✓':c.verification_status==='pending'?'Vérification en cours':'Compte non vérifié'}</span>
          <span>Profil entreprise complété à <b>${c.percent||0}%</b></span>
          ${!paid?'<span class="visibility-alert">FREE : consultation autorisée, recrutement et visibilité bloqués.</span>':''}
        </div>
        <div class="dashboard-metrics recruiter-metrics">
          <button class="dash-metric" data-dash-view="myjobs"><span>▤</span><div><small>Offres créées</small><strong>${formatCount(m.jobs)}</strong></div></button>
          <button class="dash-metric" data-dash-view="myjobs"><span>◉</span><div><small>Offres visibles</small><strong>${formatCount(m.visible_jobs)}</strong></div></button>
          <button class="dash-metric" data-dash-view="applications"><span>✓</span><div><small>Candidatures reçues</small><strong>${formatCount(m.applications)}</strong><em>${formatCount(m.new_applications)} nouvelle(s)</em></div></button>
          <button class="dash-metric" data-dash-view="myjobs"><span>◌</span><div><small>Vues des offres</small><strong>${formatCount(m.views)}</strong></div></button>
          <button class="dash-metric" data-dash-view="notifications"><span>●</span><div><small>Notifications non lues</small><strong>${formatCount(m.unread)}</strong></div></button>
          <button class="dash-metric" data-dash-view="candidates"><span>♙</span><div><small>Propositions envoyées</small><strong>${formatCount(m.recruitment_requests)}</strong></div></button>
        </div>
        <div class="dashboard-columns">
          <div class="dashboard-card"><h3>Actions rapides</h3><div class="quick-actions recruiter-quick"><button data-dash-view="jobs">＋ Publier une offre</button><button data-dash-view="applications">✓ Traiter les candidatures</button><button data-dash-view="candidates">♙ Rechercher un candidat</button><button data-dash-view="messages">✉ Ouvrir la messagerie</button></div></div>
          <div class="dashboard-card"><h3>État de vos publications</h3><div class="mini-state-grid"><div><strong>${formatCount(m.draft_jobs)}</strong><span>Brouillons</span></div><div><strong>${formatCount(m.closed_jobs)}</strong><span>Clôturées</span></div></div><button class="btn outline-blue" data-dash-view="myjobs">Gérer toutes mes offres</button></div>
        </div>
      </section>`;
    $$('[data-dash-view]').forEach(b=>b.onclick=()=>navigateView(b.dataset.dashView));
    return;
  }
  if(u.role==='candidate'){
    const c=await api('/api/profile/completeness');
    const paid=hasActivePaidPlan(), expiry=s?.plan==='free'?'sans expiration':s?.expires_at?new Date(s.expires_at).toLocaleDateString('fr-FR'):'—';
    const statusCounts={submitted:0,reviewing:0,shortlisted:0,interview:0,accepted:0,rejected:0};
    const apps=await api('/api/candidate/applications');apps.applications.forEach(a=>statusCounts[a.status]=(statusCounts[a.status]||0)+1);
    $('#viewContent').innerHTML=`
      <section class="role-dashboard candidate-command-center">
        <div class="dashboard-welcome">
          <div><span class="section-kicker">ESPACE DEMANDEUR</span><h2>Mon parcours emploi</h2><p>Suivez votre profil, vos candidatures, entretiens, propositions et messages depuis un seul espace.</p></div>
          <div class="dashboard-plan"><small>ABONNEMENT</small><strong>${esc((s?.plan||'—').toUpperCase())}</strong><span>${paid?'Actif':'FREE • actions limitées'} • ${expiry}</span></div>
        </div>
        ${!paid?'<div class="free-dashboard-notice"><b>Compte FREE :</b> vous pouvez consulter les offres, mais votre profil reste masqué aux recruteurs et « Je postule » vous conduit vers votre abonnement.</div>':''}
        <div class="dashboard-metrics candidate-metrics">
          <button class="dash-metric" data-dash-view="profile"><span>◔</span><div><small>Profil complété</small><strong>${c.percent}%</strong></div></button>
          <button class="dash-metric" data-dash-view="myapplications"><span>✓</span><div><small>Candidatures</small><strong>${formatCount(apps.applications.length)}</strong></div></button>
          <button class="dash-metric" data-dash-view="myapplications"><span>⌁</span><div><small>À l’étude / présélection</small><strong>${formatCount((statusCounts.reviewing||0)+(statusCounts.shortlisted||0))}</strong></div></button>
          <button class="dash-metric" data-dash-view="myapplications"><span>◈</span><div><small>Entretiens</small><strong>${formatCount(statusCounts.interview||0)}</strong></div></button>
          <button class="dash-metric" data-dash-view="recruitment"><span>★</span><div><small>Propositions reçues</small><strong>${formatCount(m.recruitment_requests)}</strong></div></button>
          <button class="dash-metric" data-dash-view="notifications"><span>●</span><div><small>Notifications non lues</small><strong>${formatCount(m.unread)}</strong></div></button>
        </div>
        <div class="dashboard-columns">
          <div class="dashboard-card"><h3>Améliorer mon profil</h3><div class="progress-track"><span style="width:${c.percent}%"></span></div><div class="recommendations">${c.recommendations?.length?c.recommendations.slice(0,5).map(x=>`<button class="recommendation" data-dash-view="profile">+ ${esc(x)}</button>`).join(''):'<p class="muted">Votre profil est bien renseigné.</p>'}</div></div>
          <div class="dashboard-card"><h3>Accès rapides</h3><div class="quick-actions"><button data-dash-view="jobs">▣ Voir les offres</button><button data-dash-view="myapplications">✓ Mes candidatures</button><button data-dash-view="recruitment">★ Propositions reçues</button><button data-dash-view="messages">✉ Messages</button>${!paid?'<button data-dash-view="subscription">◈ Activer mon abonnement</button>':''}</div></div>
        </div>
      </section>`;
    $$('[data-dash-view]').forEach(b=>b.onclick=()=>navigateView(b.dataset.dashView));return;
  }
  $('#viewContent').innerHTML=`<div class="dashboard-welcome"><div><span class="section-kicker">SUPER ADMIN • PERMANENT</span><h2>Centre de pilotage</h2><p>Gérez tous les membres inscrits et l’activité de GLOBAL EMPLOI.</p></div></div><div class="dashboard-metrics admin-metrics"><button class="dash-metric" data-dash-view="inbox"><span>●</span><div><small>Inscriptions</small><strong>${formatCount(m.total_users)}</strong></div></button><button class="dash-metric" data-dash-view="members"><span>♙</span><div><small>Membres</small><strong>${formatCount(m.total_users)}</strong></div></button><button class="dash-metric" data-dash-view="activations"><span>◈</span><div><small>Activations</small><strong>${formatCount(m.pending_subscriptions)}</strong></div></button><button class="dash-metric" data-dash-view="jobsadmin"><span>▣</span><div><small>Offres</small><strong>${formatCount(m.jobs)}</strong></div></button><button class="dash-metric" data-dash-view="applicationsadmin"><span>✓</span><div><small>Candidatures</small><strong>${formatCount(m.applications)}</strong></div></button></div>`;
  $$('[data-dash-view]').forEach(b=>b.onclick=()=>navigateView(b.dataset.dashView));
}
async function renderProfile(){const d=await api('/api/profile'),p=d.profile||{};if(state.session.user.role==='super_admin')return $('#viewContent').innerHTML='<div class="panel">Le Super Admin ne possède pas de profil candidat/recruteur.</div>';const candidate=state.session.user.role==='candidate';if(!candidate){
  const docs=d.documents||[],comp=d.completeness||{percent:0,recommendations:[],verification_status:'unverified'};
  const status=comp.verification_status||p.verification_status||'unverified';
  const statusLabel=status==='verified'?'Entreprise vérifiée ✓':status==='pending'?'Vérification en cours':'Compte non vérifié';
  $('#viewContent').innerHTML=`
  <div class="verification-card ${status}">
    <div><span class="section-kicker">VÉRIFICATION DU COMPTE</span><h3>${statusLabel}</h3>
    <p>${status==='verified'?'Votre entreprise bénéficie du badge GLOBAL EMPLOI vérifié.':status==='pending'?'Votre dossier est en cours d’examen par GLOBAL EMPLOI.':'Complétez votre entreprise et ajoutez un document officiel pour demander la vérification.'}</p></div>
    ${status==='unverified'?'<button id="submitVerification" class="btn primary">Demander la vérification</button>':''}
  </div>
  <div class="profile-progress-card compact"><div><span class="section-kicker">COMPLÉTUDE DU PROFIL ENTREPRISE</span><h3>Profil complété à ${comp.percent}%</h3><p class="muted">${comp.recommendations?.length?comp.recommendations.join(' • '):'Votre profil recruteur est bien renseigné.'}</p></div><div class="progress-track"><span style="width:${comp.percent}%"></span></div></div>
  <form id="profileForm" class="candidate-profile-form">
    <input type="hidden" name="photo" value="${esc(p.photo)}"><input type="hidden" name="logo" value="${esc(p.logo)}">
    <section class="profile-section"><div class="section-number">1</div><div class="section-title"><h3>Informations du recruteur</h3><p>Identité et coordonnées de la personne responsable du compte.</p></div>
      <div class="form-grid">
        <div class="field"><label>Nom *</label><input name="last_name" value="${esc(p.last_name)}" required></div>
        <div class="field"><label>Prénoms *</label><input name="first_name" value="${esc(p.first_name)}" required></div>
        <div class="field full"><label>Fonction / Poste *</label><input name="job_title" value="${esc(p.job_title)}" placeholder="Responsable RH, Directeur, Gérant…" required></div>
        <div class="field"><label>Numéro WhatsApp</label><input name="whatsapp" value="${esc(p.whatsapp)}"></div>
        <div class="field"><label>Ville de résidence</label><input name="city" value="${esc(p.city)}"></div>
        <div class="field"><label>Pays de résidence *</label><input name="country" value="${esc(p.country||'Côte d’Ivoire')}" required></div>
        <div class="field full"><label>Photo de profil (facultative)</label><input id="recruiterPhotoFile" type="file" accept="image/jpeg,image/png,image/webp"><small class="muted">JPG, PNG ou WebP — maximum 500 Ko.</small></div>
      </div>
    </section>
    <section class="profile-section"><div class="section-number">2</div><div class="section-title"><h3>Informations sur l’entreprise</h3></div>
      <div class="form-grid">
        <div class="field"><label>Nom / Raison sociale de l’entreprise *</label><input name="company_name" value="${esc(p.company_name)}" required></div>
        <div class="field"><label>Nom commercial</label><input name="trade_name" value="${esc(p.trade_name)}"></div>
        <div class="field"><label>Type d’organisation *</label><select name="organization_type" required>${opts(['Entreprise individuelle','SARL','SARLU','SA','ONG / Association','Institution publique','Cabinet de recrutement','Agence d’intérim','Autre'],p.organization_type)}</select></div>
        <div class="field"><label>Secteur d’activité *</label><input name="sector" value="${esc(p.sector)}" required></div>
        <div class="field"><label>Domaine principal *</label><input name="main_domain" value="${esc(p.main_domain)}" required></div>
        <div class="field"><label>Année de création</label><input name="foundation_year" type="number" min="1900" max="2100" value="${esc(p.foundation_year)}"></div>
        <div class="field"><label>Nombre d’employés</label><select name="employee_count">${opts(['','1 à 5','6 à 20','21 à 50','51 à 100','101 à 500','Plus de 500'],p.employee_count)}</select></div>
        <div class="field"><label>Pays *</label><input name="company_country" value="${esc(p.company_country||'Côte d’Ivoire')}" required></div>
        <div class="field"><label>Ville *</label><input name="company_city" value="${esc(p.company_city)}" required></div>
        <div class="field"><label>Commune / Quartier</label><input name="district" value="${esc(p.district)}"></div>
        <div class="field full"><label>Adresse de l’entreprise</label><input name="address" value="${esc(p.address)}"></div>
        <div class="field"><label>Site internet</label><input name="website" type="url" value="${esc(p.website)}" placeholder="https://"></div>
        <div class="field"><label>Page Facebook / LinkedIn</label><input name="social_page" value="${esc(p.social_page)}"></div>
        <div class="field full"><label>Description de l’entreprise</label><textarea name="description">${esc(p.description)}</textarea></div>
        <div class="field full"><label>Logo de l’entreprise</label><input id="companyLogoFile" type="file" accept="image/jpeg,image/png,image/webp"><small class="muted">JPG, PNG ou WebP — maximum 500 Ko.</small></div>
      </div>
    </section>
    <section class="profile-section"><div class="section-number">3</div><div class="section-title"><h3>Informations administratives</h3><p>Ces informations aident GLOBAL EMPLOI à vérifier l’existence de l’organisation.</p></div>
      <div class="form-grid">
        <div class="field"><label>Numéro RCCM</label><input name="rccm" value="${esc(p.rccm)}"></div>
        <div class="field"><label>Numéro d’identification fiscale / CC</label><input name="tax_id" value="${esc(p.tax_id)}"></div>
        <div class="field"><label>Numéro CNPS</label><input name="cnps" value="${esc(p.cnps)}"></div>
      </div>
      <div class="documents-grid recruiter-docs">
        ${recruiterDocumentUploader('rccm','RCCM / Registre de commerce')}
        ${recruiterDocumentUploader('existence','Attestation d’existence')}
        ${recruiterDocumentUploader('official','Autre document officiel')}
      </div>
      <div class="document-list">${docs.map(x=>`<span class="doc-chip">${esc(x.file_name)} <button type="button" data-recruiter-doc-delete="${x.id}">×</button></span>`).join('')}</div>
    </section>
    <section class="profile-section"><div class="section-number">4</div><div class="section-title"><h3>Besoins en recrutement</h3></div>
      <div class="form-grid">
        <div class="field full"><label>Métiers généralement recherchés</label><textarea name="desired_trades" placeholder="Commercial, comptable, chauffeur, maçon…">${esc(p.desired_trades)}</textarea></div>
        <div class="field full"><label>Domaines de recrutement</label><textarea name="recruitment_domains">${esc(p.recruitment_domains)}</textarea></div>
        <div class="field"><label>Nombre moyen de recrutements par an</label><select name="annual_recruitment_count">${opts(['','1 à 5','6 à 10','11 à 25','26 à 50','Plus de 50'],p.annual_recruitment_count)}</select></div>
        <div class="field full"><label>Types de contrats proposés</label><div class="choice-grid">${checks(['CDI','CDD','Stage','Intérim','Freelance','Temps partiel','Journalier','Apprentissage'],p.contract_types,'recruiter_contract_choice')}</div></div>
        <div class="field full"><label>Zones principales de recrutement</label><textarea name="recruitment_zones">${esc(p.recruitment_zones)}</textarea></div>
        <div class="field"><label>Recrutement à l’international</label><select name="international_recruitment">${optsVal([['0','Non'],['1','Oui']],String(p.international_recruitment||0))}</select></div>
      </div>
    </section>
    <section class="profile-section"><div class="section-number">5</div><div class="section-title"><h3>Préférences du compte</h3></div>
      <label class="check-row"><input type="checkbox" name="marketing_alerts" ${p.marketing_alerts?'checked':''}> Je souhaite recevoir des informations et alertes de GLOBAL EMPLOI.</label>
    </section>
    <section class="profile-section verification-steps"><div class="section-number">6</div><div class="section-title"><h3>Vérification du compte recruteur</h3><p>Statut actuel : <strong>${statusLabel}</strong></p></div>
      <div class="verification-grid">
        <div class="${p.email_verified?'done':''}">✓ Adresse e-mail</div>
        <div class="${p.phone_verified?'done':''}">✓ Numéro de téléphone</div>
        <div class="${p.company_info_verified?'done':''}">✓ Informations entreprise</div>
        <div class="${p.official_document_verified?'done':''}">✓ Document officiel</div>
      </div>
      ${status==='verified'?'<div class="verified-badge">Entreprise vérifiée ✓</div>':''}
      ${p.verification_note?`<p class="notice-error">${esc(p.verification_note)}</p>`:''}
    </section>
    <div class="sticky-save"><button class="btn primary big">ENREGISTRER MON PROFIL ENTREPRISE</button></div>
  </form>`;
  $('#profileForm').onsubmit=saveRecruiterProfile;
  bindRecruiterDocumentUploads();
  $('#submitVerification')?.addEventListener('click',async()=>{try{await api('/api/recruiter/verification/submit',{method:'POST',body:'{}'});toast('Demande de vérification envoyée.');renderProfile()}catch(e){toast(e.message)}});
  return;
}
const edu=d.education||[],exp=d.experiences||[],langs=d.languages||[],docs=d.documents||[],comp=d.completeness||{percent:0,recommendations:[]};$('#viewContent').innerHTML=`<div class="profile-progress-card compact candidate-profile-progress"><div><span class="section-kicker">COMPLÉTUDE DU PROFIL</span><h3>Profil complété à ${comp.percent}%</h3><p class="muted">${comp.recommendations.length?comp.recommendations.join(' • '):'Votre profil est très bien renseigné.'}</p><button type="button" id="previewCandidateProfile" class="btn outline-blue">Voir mon profil comme un recruteur</button></div><div class="progress-track"><span style="width:${comp.percent}%"></span></div></div><form id="profileForm" class="candidate-profile-form"><section class="profile-section"><div class="section-number">1</div><div class="section-title"><h3>Informations personnelles</h3><p>Vos coordonnées et informations de résidence.</p></div><div class="form-grid"><div class="field"><label>Nom *</label><input name="last_name" value="${esc(p.last_name)}" required></div><div class="field"><label>Prénoms *</label><input name="first_name" value="${esc(p.first_name)}" required></div><div class="field"><label>Sexe</label><select name="gender">${opts(['','Homme','Femme'],p.gender)}</select></div><div class="field"><label>Date de naissance *</label><input type="date" name="birth_date" value="${esc(p.birth_date)}" required></div><div class="field"><label>Nationalité *</label><input name="nationality" value="${esc(p.nationality)}" required></div><div class="field"><label>Situation matrimoniale</label><input name="marital_status" value="${esc(p.marital_status)}"></div><div class="field"><label>Numéro WhatsApp</label><input name="whatsapp" value="${esc(p.whatsapp)}"></div><div class="field"><label>Ville de résidence *</label><input name="city" value="${esc(p.city)}" required></div><div class="field"><label>Commune / Quartier</label><input name="location" value="${esc(p.location)}"></div><div class="field"><label>Pays de résidence *</label><input name="country" value="${esc(p.country||'Côte d’Ivoire')}" required></div></div></section><section class="profile-section"><div class="section-number">2</div><div class="section-title"><h3>Informations professionnelles</h3></div><div class="form-grid"><div class="field"><label>Titre du profil professionnel *</label><input name="professional_title" value="${esc(p.professional_title)}" placeholder="Ex. Comptable, Chauffeur, Maçon…" required></div><div class="field"><label>Domaine d’activité *</label><input name="activity_domain" value="${esc(p.activity_domain)}" required></div><div class="field"><label>Métier principal *</label><input name="profession" value="${esc(p.profession)}" required></div><div class="field"><label>Niveau d’expérience</label><select name="experience_level">${opts(['Sans expérience','Moins de 1 an','1 à 3 ans','3 à 5 ans','5 à 10 ans','Plus de 10 ans'],p.experience_level)}</select></div><div class="field"><label>Situation actuelle</label><select name="current_situation">${opts(['Sans emploi','Employé','Travailleur indépendant','Stagiaire','Étudiant','En reconversion professionnelle'],p.current_situation)}</select></div><div class="field full"><label>Autres métiers / compétences</label><textarea name="other_skills">${esc(p.other_skills)}</textarea></div><div class="field full"><label>Présentation / Profil professionnel</label><textarea name="description">${esc(p.description)}</textarea></div><div class="field full"><label>Compétences principales</label><textarea name="skills">${esc(p.skills)}</textarea></div><div class="field"><label>Permis de conduire</label><select name="driving_license">${optsVal([['0','Non'],['1','Oui']],String(p.driving_license||0))}</select></div><div class="field"><label>Catégorie du permis</label><input name="driving_category" value="${esc(p.driving_category)}"></div></div></section><section class="profile-section"><div class="section-number">3</div><div class="section-title"><h3>Formation et diplômes</h3></div><div class="form-grid"><div class="field"><label>Niveau d’étude *</label><select name="education_level" required>${opts(['Aucun diplôme','Primaire','BEPC','CAP','BT','BAC','BTS','Licence','Master','Doctorat','Autre'],p.education_level)}</select></div></div><div id="educationList">${edu.map(educationRow).join('')}</div><button type="button" id="addEducation" class="btn ghost">+ Ajouter un autre diplôme</button></section><section class="profile-section"><div class="section-number">4</div><div class="section-title"><h3>Expériences professionnelles</h3></div><div id="experienceList">${exp.map(experienceRow).join('')}</div><button type="button" id="addExperience" class="btn ghost">+ Ajouter une expérience</button></section><section class="profile-section"><div class="section-number">5</div><div class="section-title"><h3>Recherche d’emploi</h3></div><div class="form-grid"><div class="field"><label>Poste recherché *</label><input name="target_position" value="${esc(p.target_position)}" required></div><div class="field"><label>Domaine recherché *</label><input name="target_domain" value="${esc(p.target_domain)}" required></div><div class="field full"><label>Type de contrat souhaité</label><div class="choice-grid">${checks(['CDI','CDD','Stage','Intérim','Freelance','Journalier','Temps partiel'],p.desired_contracts,'contract_choice')}</div></div><div class="field"><label>Ville souhaitée</label><input name="desired_city" value="${esc(p.desired_city)}"></div><div class="field"><label>Mobilité</label><select name="mobility">${opts(['Ma ville uniquement','Partout en Côte d’Ivoire','À l’international'],p.mobility)}</select></div><div class="field"><label>Disponibilité</label><select name="availability">${opts(['Immédiatement','Sous 15 jours','Sous 1 mois','À préciser'],p.availability)}</select></div><div class="field"><label>Salaire souhaité (FCFA / mois)</label><input name="desired_salary" type="number" min="0" value="${p.desired_salary||''}"></div><div class="field"><label>Déplacements professionnels</label><select name="accepts_travel">${optsVal([['0','Non'],['1','Oui']],String(p.accepts_travel||0))}</select></div></div></section><section class="profile-section"><div class="section-number">6</div><div class="section-title"><h3>Documents</h3><p>PDF, DOC, DOCX, JPG ou PNG — 700 Ko maximum par fichier.</p></div><div class="documents-grid">${documentUploader('cv','Télécharger mon CV')}${documentUploader('motivation','Lettre de motivation')}${documentUploader('diploma','Diplômes / Certificats')}${documentUploader('work_certificate','Attestations de travail')}${documentUploader('identity','Pièce d’identité (facultative)')}</div><div id="documentList" class="document-list">${docs.map(x=>`<span class="doc-chip">${esc(x.file_name)} <button type="button" data-doc-delete="${x.id}">×</button></span>`).join('')}</div></section><section class="profile-section"><div class="section-number">7</div><div class="section-title"><h3>Langues</h3></div><div id="languageList">${langs.map(languageRow).join('')}</div><button type="button" id="addLanguage" class="btn ghost">+ Ajouter une langue</button></section><section class="profile-section"><div class="section-number">8</div><div class="section-title"><h3>Préférences du compte</h3></div><label class="check-row"><input type="checkbox" name="job_alerts" ${p.job_alerts?'checked':''}> Je souhaite recevoir des alertes correspondant à mon profil et aux emplois recherchés.</label></section><div class="sticky-save"><button class="btn primary big">ENREGISTRER MON PROFIL</button></div></form>`;bindDynamicProfile();$('#profileForm').onsubmit=saveCandidateProfile;bindDocumentUploads();$('#previewCandidateProfile')?.addEventListener('click',previewMyCandidateProfile);}

async function previewMyCandidateProfile(){
  try{
    const d=await api('/api/profile/preview'),c=d.candidate||{};
    const paid=hasActivePaidPlan();
    modal(`<div class="detail-popup candidate-preview">
      <div class="candidate-detail-head">${c.photo?`<img src="${esc(c.photo)}" alt="">`:`<div class="candidate-photo large"><span>${esc(((c.first_name||'P')[0]||'P')+((c.last_name||'')[0]||''))}</span></div>`}
      <div><span class="pill">${paid?'VISIBLE AUX RECRUTEURS':'MASQUÉ EN FREE'}</span><h2>${esc(`${c.first_name||''} ${c.last_name||''}`.trim()||'Mon profil')}</h2><p><b>${esc(c.professional_title||c.profession||'Profil professionnel')}</b></p><p class="muted">⌖ ${esc(c.city||'—')}, ${esc(c.country||'')}</p></div></div>
      ${!paid?'<div class="free-dashboard-notice"><b>Aperçu uniquement :</b> votre profil reste masqué aux recruteurs tant que STANDARD ou BUSINESS n’est pas actif.</div>':''}
      <div class="detail-grid"><div><small>Domaine</small><strong>${esc(c.activity_domain||'—')}</strong></div><div><small>Expérience</small><strong>${esc(c.experience_level||c.experience_years||'—')}</strong></div><div><small>Disponibilité</small><strong>${esc(c.availability||'—')}</strong></div><div><small>Poste recherché</small><strong>${esc(c.target_position||'—')}</strong></div><div><small>Contrats</small><strong>${esc(c.desired_contracts||'—')}</strong></div><div><small>Mobilité</small><strong>${esc(c.mobility||'—')}</strong></div></div>
      <div class="detail-section"><h3>Présentation</h3><p>${esc(c.description||'Aucune présentation renseignée.')}</p></div>
      <div class="detail-section"><h3>Compétences</h3><p>${esc(c.skills||c.other_skills||'—')}</p></div>
      ${d.experiences?.length?`<div class="detail-section"><h3>Expériences</h3>${d.experiences.map(x=>`<div class="mini-record"><b>${esc(x.position||'Poste')}</b> — ${esc(x.company||'')}<br><small>${esc(x.city_country||'')}</small></div>`).join('')}</div>`:''}
      ${d.education?.length?`<div class="detail-section"><h3>Formations</h3>${d.education.map(x=>`<div class="mini-record"><b>${esc(x.diploma||'Formation')}</b> • ${esc(x.specialty||'')}<br><small>${esc(x.institution||'')}</small></div>`).join('')}</div>`:''}
      ${!paid?'<div class="detail-actions"><button id="previewGoSubscription" class="btn primary">Activer mon abonnement</button></div>':''}
    </div>`);
    $('#previewGoSubscription')?.addEventListener('click',()=>{closeModal();navigateView('subscription')});
  }catch(err){toast(err.message)}
}
function opts(values,current=''){return values.map(v=>`<option value="${esc(v)}" ${String(v)===String(current||'')?'selected':''}>${esc(v||'Sélectionner')}</option>`).join('')}
function optsVal(values,current=''){return values.map(([v,l])=>`<option value="${esc(v)}" ${String(v)===String(current)?'selected':''}>${esc(l)}</option>`).join('')}
function checks(values,current='',cls=''){const set=new Set(String(current||'').split(',').map(x=>x.trim()));return values.map(v=>`<label class="choice"><input class="${cls}" type="checkbox" value="${esc(v)}" ${set.has(v)?'checked':''}> ${esc(v)}</label>`).join('')}
function fileToDataURL(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)})}
function educationRow(x={}){return `<div class="repeat-card education-row"><button type="button" class="repeat-remove">×</button><div class="form-grid"><div class="field"><label>Diplôme principal</label><input data-k="diploma" value="${esc(x.diploma)}"></div><div class="field"><label>Spécialité / Filière</label><input data-k="specialty" value="${esc(x.specialty)}"></div><div class="field"><label>Établissement</label><input data-k="institution" value="${esc(x.institution)}"></div><div class="field"><label>Année d’obtention</label><input data-k="graduation_year" value="${esc(x.graduation_year)}"></div></div></div>`}
function experienceRow(x={}){return `<div class="repeat-card experience-row"><button type="button" class="repeat-remove">×</button><div class="form-grid"><div class="field"><label>Poste occupé</label><input data-k="position" value="${esc(x.position)}"></div><div class="field"><label>Nom de l’entreprise</label><input data-k="company" value="${esc(x.company)}"></div><div class="field"><label>Ville / Pays</label><input data-k="city_country" value="${esc(x.city_country)}"></div><div class="field"><label>Date de début</label><input data-k="start_date" type="date" value="${esc(x.start_date)}"></div><div class="field"><label>Date de fin</label><input data-k="end_date" type="date" value="${esc(x.end_date)}" ${x.current_job?'disabled':''}></div><label class="check-row"><input data-k="current_job" type="checkbox" ${x.current_job?'checked':''}> Je travaille actuellement à ce poste</label><div class="field full"><label>Missions et responsabilités</label><textarea data-k="responsibilities">${esc(x.responsibilities)}</textarea></div></div></div>`}
function languageRow(x={}){return `<div class="repeat-card language-row"><button type="button" class="repeat-remove">×</button><div class="form-grid"><div class="field"><label>Langue</label><input data-k="language" value="${esc(x.language)}"></div><div class="field"><label>Niveau</label><select data-k="level">${opts(['Débutant','Moyen','Bon','Très bon','Courant'],x.level)}</select></div></div></div>`}
function documentUploader(type,label){return `<label class="upload-card"><strong>${esc(label)}</strong><span>Choisir un fichier</span><input class="doc-upload" data-type="${type}" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"></label>`}
function bindDynamicProfile(){const add=(btn,list,fn)=>$(btn).onclick=()=>{$(list).insertAdjacentHTML('beforeend',fn());bindRemovers()};add('#addEducation','#educationList',educationRow);add('#addExperience','#experienceList',experienceRow);add('#addLanguage','#languageList',languageRow);bindRemovers();$$('.experience-row input[data-k="current_job"]').forEach(c=>c.onchange=()=>{const end=c.closest('.experience-row').querySelector('[data-k="end_date"]');end.disabled=c.checked;if(c.checked)end.value=''})}
function bindRemovers(){$$('.repeat-remove').forEach(b=>b.onclick=()=>b.closest('.repeat-card').remove())}
function collectRows(sel){return $$(sel).map(row=>{const o={};row.querySelectorAll('[data-k]').forEach(el=>o[el.dataset.k]=el.type==='checkbox'?el.checked:el.value);return o}).filter(o=>Object.values(o).some(Boolean))}
async function saveSimpleProfile(e){e.preventDefault();try{await api('/api/profile',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});toast('Profil enregistré')}catch(err){toast(err.message)}}
async function saveCandidateProfile(e){e.preventDefault();const fd=new FormData(e.target),f=Object.fromEntries(fd);f.driving_license=f.driving_license==='1';f.accepts_travel=f.accepts_travel==='1';f.job_alerts=fd.get('job_alerts')==='on';f.desired_contracts=$$('.contract_choice:checked').map(x=>x.value).join(', ');f.education_items=JSON.stringify(collectRows('.education-row'));f.experience_items=JSON.stringify(collectRows('.experience-row'));f.language_items=JSON.stringify(collectRows('.language-row'));try{await api('/api/profile',{method:'POST',body:JSON.stringify(f)});toast('Profil enregistré avec succès');renderProfile()}catch(err){toast(err.message)}}
function bindDocumentUploads(){$$('.doc-upload').forEach(inp=>inp.onchange=async()=>{const file=inp.files?.[0];if(!file)return;if(file.size>700*1024){toast('Fichier trop volumineux : maximum 700 Ko.');inp.value='';return}const fd=new FormData();fd.append('document_type',inp.dataset.type);fd.append('file',file);try{const r=await fetch('/api/profile/documents',{method:'POST',body:fd});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Erreur d’envoi');toast('Document ajouté');renderProfile()}catch(e){toast(e.message)}});$$('[data-doc-delete]').forEach(b=>b.onclick=async()=>{try{await api('/api/profile/documents/'+b.dataset.docDelete,{method:'DELETE'});toast('Document supprimé');renderProfile()}catch(e){toast(e.message)}})}


function recruiterDocumentUploader(type,label){return `<label class="upload-card"><strong>${esc(label)}</strong><span>Télécharger un document</span><input class="recruiter-doc-upload" data-type="${type}" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"></label>`}
async function saveRecruiterProfile(e){
  e.preventDefault();const fd=new FormData(e.target),f=Object.fromEntries(fd);
  f.international_recruitment=f.international_recruitment==='1';f.marketing_alerts=fd.get('marketing_alerts')==='on';
  f.contract_types=$$('.recruiter_contract_choice:checked').map(x=>x.value).join(', ');
  for(const [id,key] of [['recruiterPhotoFile','photo'],['companyLogoFile','logo']]){const file=$('#'+id)?.files?.[0];if(file){if(file.size>500*1024)return toast('Image trop volumineuse : maximum 500 Ko.');f[key]=await fileToDataURL(file)}}
  try{await api('/api/profile',{method:'POST',body:JSON.stringify(f)});toast('Profil entreprise enregistré.');renderProfile()}catch(err){toast(err.message)}
}
function bindRecruiterDocumentUploads(){
  $$('.recruiter-doc-upload').forEach(inp=>inp.onchange=async()=>{const file=inp.files?.[0];if(!file)return;if(file.size>900*1024){toast('Fichier trop volumineux : maximum 900 Ko.');inp.value='';return}const fd=new FormData();fd.append('document_type',inp.dataset.type);fd.append('file',file);try{const r=await fetch('/api/recruiter/documents',{method:'POST',body:fd});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Erreur d’envoi');toast('Document justificatif ajouté.');renderProfile()}catch(e){toast(e.message)}});
  $$('[data-recruiter-doc-delete]').forEach(b=>b.onclick=async()=>{try{await api('/api/recruiter/documents/'+b.dataset.recruiterDocDelete,{method:'DELETE'});toast('Document supprimé.');renderProfile()}catch(e){toast(e.message)}})
}

async function renderJobs(){
  const role=state.session.user.role;
  if(role==='candidate'){
    const paid=hasActivePaidPlan();
    $('#viewContent').innerHTML=`
      <div class="module-hero"><div><span class="section-kicker">OFFRES D’EMPLOI</span><h2>Trouvez votre prochaine opportunité</h2><p>Les offres affichées proviennent uniquement de recruteurs STANDARD ou BUSINESS actifs.</p></div>${!paid?'<button class="btn primary candidate-subscription-shortcut">Activer pour postuler</button>':''}</div>
      ${!paid?'<div class="free-dashboard-notice"><b>Vous êtes en FREE :</b> la consultation est libre. En cliquant sur « Je postule », vous serez dirigé vers la page Abonnement.</div>':''}
      <div class="market-search candidate-job-search">
        <div class="field"><label>Poste / métier</label><input id="candidateJobQ" placeholder="Comptable, Chauffeur, Maçon…"></div>
        <div class="field"><label>Ville</label><input id="candidateJobCity" placeholder="Abidjan, Bouaké…"></div>
        <div class="field"><label>Type de contrat</label><select id="candidateJobContract"><option value="">Tous</option><option>CDI</option><option>CDD</option><option>Stage</option><option>Intérim</option><option>Freelance</option><option>Temps partiel</option><option>Journalier</option></select></div>
        <div class="field"><label>Domaine</label><input id="candidateJobCategory" placeholder="BTP, Commerce, Informatique…"></div>
        <div class="field"><label>Publication</label><select id="candidateJobDays"><option value="0">Toutes les dates</option><option value="1">Aujourd’hui</option><option value="7">7 derniers jours</option><option value="30">30 derniers jours</option></select></div>
        <button id="candidateJobSearchBtn" class="btn primary">Rechercher</button>
      </div>
      <div id="candidateJobsCount" class="results-count"></div>
      <div id="candidateJobsGrid" class="offer-grid dynamic-grid"><div class="directory-skeleton"><span></span><span></span><span></span></div></div><div id="candidateJobsPagination" class="public-pagination"></div>`;
    $('.candidate-subscription-shortcut')?.addEventListener('click',()=>navigateView('subscription'));
    const load=async(page=1)=>{
      const grid=$('#candidateJobsGrid');
      grid.innerHTML='<div class="directory-skeleton"><span></span><span></span><span></span></div>';
      $('#candidateJobsPagination').innerHTML='';
      try{
        const qs=new URLSearchParams({q:$('#candidateJobQ').value.trim(),city:$('#candidateJobCity').value.trim(),contract:$('#candidateJobContract').value,category:$('#candidateJobCategory').value.trim(),days:$('#candidateJobDays').value,page:String(page),per_page:'12'});
        const d=await api(`/api/jobs?${qs}`),pg=d.pagination||{page:1,pages:1,total:d.jobs.length};
        $('#candidateJobsCount').textContent=`${formatCount(pg.total)} offre${pg.total>1?'s':''} disponible${pg.total>1?'s':''} • Page ${pg.page}/${pg.pages}`;
        grid.innerHTML=d.jobs.length?d.jobs.map(j=>`<article class="offer-card candidate-job-card"><div class="offer-top"><div class="company-logo">${j.logo?`<img src="${esc(j.logo)}" alt="">`:esc((j.company_name||'GE').slice(0,2).toUpperCase())}</div><span class="offer-badge new">${esc((j.plan||'standard').toUpperCase())}</span></div><h3>${esc(j.title)}</h3><p class="company">${esc(j.company_name||'Entreprise')}</p><div class="offer-meta"><span>⌖ ${esc(j.location||'')}</span><span>▣ ${esc(j.employment_type||'')}</span></div><p class="card-summary">${esc((j.description||'').slice(0,150))}${(j.description||'').length>150?'…':''}</p><div class="card-actions"><button class="btn outline-blue candidate-job-detail" data-id="${j.id}">Voir l’offre</button><button class="btn primary candidate-job-apply" data-id="${j.id}">Je postule</button></div></article>`).join(''):'<div class="panel empty-state">Aucune offre ne correspond à votre recherche.</div>';
        $$('.candidate-job-detail').forEach(b=>b.onclick=()=>openJobDetail(Number(b.dataset.id)));
        $$('.candidate-job-apply').forEach(b=>b.onclick=()=>requirePaidCandidateAction(()=>applyFromPublic(Number(b.dataset.id))));
        renderDirectoryPagination('#candidateJobsPagination',pg,p=>load(p));
      }catch(err){
        $('#candidateJobsCount').textContent='';
        grid.innerHTML=directoryError('Impossible de charger les offres.',err,()=>load(page));
        bindDirectoryRetry(grid,()=>load(page));
      }
    };
    $('#candidateJobSearchBtn').onclick=()=>load(1);
    ['candidateJobQ','candidateJobCity','candidateJobCategory'].forEach(id=>$('#'+id).onkeydown=e=>{if(e.key==='Enter')load(1)});
    await load(1);return;
  }
  if(role==='super_admin'){navigateView('jobsadmin');return;}
  const paid=hasActivePaidPlan();
  $('#viewContent').innerHTML=`
    <div class="module-hero"><div><span class="section-kicker">PUBLICATION</span><h2>Créer une offre professionnelle</h2><p>Préparez votre recrutement avec toutes les informations utiles aux candidats.</p></div><span class="status-badge ${paid?'active':'hidden-status'}">${paid?'Publication visible si publiée':'FREE : publication masquée'}</span></div>
    ${!paid?'<div class="visibility-notice"><b>Compte FREE :</b> vous pouvez préparer vos offres et les enregistrer, mais elles restent masquées jusqu’à l’activation STANDARD ou BUSINESS.</div>':''}
    <div class="panel professional-form-panel">
      <form id="jobForm" class="form-grid recruiter-job-form">
        <div class="field"><label>Intitulé du poste *</label><input name="title" required></div>
        <div class="field"><label>Métier / profession</label><input name="profession"></div>
        <div class="field"><label>Domaine / catégorie</label><input name="category"></div>
        <div class="field"><label>Type de contrat</label><select name="employment_type"><option>CDI</option><option>CDD</option><option>Stage</option><option>Intérim</option><option>Freelance</option><option>Temps partiel</option><option>Journalier</option><option>Apprentissage</option><option>Mission</option></select></div>
        <div class="field"><label>Ville / lieu *</label><input name="location" required></div>
        <div class="field"><label>Nombre de postes</label><input name="vacancies" type="number" min="1" value="1"></div>
        <div class="field"><label>Niveau d’études souhaité</label><input name="education_required" placeholder="Ex. BAC, BTS, Licence…"></div>
        <div class="field"><label>Expérience demandée</label><input name="experience_required" placeholder="Ex. 2 ans minimum"></div>
        <div class="field"><label>Rémunération</label><input name="salary" placeholder="Facultatif"></div>
        <div class="field"><label>Disponibilité souhaitée</label><input name="availability_required" placeholder="Immédiate, sous 15 jours…"></div>
        <div class="field"><label>Date de début</label><input name="starts_at" type="date"></div>
        <div class="field"><label>Date limite de candidature</label><input name="closes_at" type="date"></div>
        <div class="field full"><label>Missions et responsabilités</label><textarea name="responsibilities" rows="5"></textarea></div>
        <div class="field full"><label>Compétences requises</label><textarea name="skills_required" rows="4"></textarea></div>
        <div class="field full"><label>Profil recherché</label><textarea name="candidate_profile" rows="4"></textarea></div>
        <div class="field full"><label>Horaires / conditions de travail</label><textarea name="work_schedule" rows="3"></textarea></div>
        <div class="field full"><label>Description complète *</label><textarea name="description" rows="7" required></textarea></div>
        <input type="hidden" name="status" id="jobStatusField" value="published">
        <div class="full form-actions">
          <button class="btn outline-blue" type="button" id="previewJob">Prévisualiser</button>
          <button class="btn ghost" type="button" id="saveDraftJob">Enregistrer comme brouillon</button>
          <button class="btn primary" type="submit">Publier l’offre</button>
        </div>
      </form>
    </div>`;
  const form=$('#jobForm');
  const collect=()=>Object.fromEntries(new FormData(form));
  $('#previewJob').onclick=()=>previewRecruiterJob(collect());
  $('#saveDraftJob').onclick=()=>{$('#jobStatusField').value='draft';form.requestSubmit()};
  form.onsubmit=async e=>{
    e.preventDefault();
    const data=collect();
    try{
      await api('/api/jobs',{method:'POST',body:JSON.stringify(data)});
      toast(data.status==='draft'?'Brouillon enregistré.':paid?'Offre publiée.':'Offre enregistrée mais masquée en FREE.');
      setTimeout(()=>navigateView('myjobs'),350);
    }catch(err){toast(err.message)}
  };
}
function previewRecruiterJob(j){
  modal(`<div class="detail-popup"><span class="section-kicker">PRÉVISUALISATION</span><h2>${esc(j.title||'Intitulé du poste')}</h2><p><b>${esc(j.employment_type||'Contrat')}</b> • ${esc(j.location||'Lieu')}</p><div class="detail-grid"><div><small>Métier</small><strong>${esc(j.profession||'—')}</strong></div><div><small>Études</small><strong>${esc(j.education_required||'—')}</strong></div><div><small>Expérience</small><strong>${esc(j.experience_required||'—')}</strong></div><div><small>Rémunération</small><strong>${esc(j.salary||'Non précisée')}</strong></div><div><small>Postes</small><strong>${esc(j.vacancies||1)}</strong></div><div><small>Disponibilité</small><strong>${esc(j.availability_required||'—')}</strong></div></div>${j.responsibilities?`<div class="detail-section"><h3>Missions</h3><p>${esc(j.responsibilities)}</p></div>`:''}${j.skills_required?`<div class="detail-section"><h3>Compétences requises</h3><p>${esc(j.skills_required)}</p></div>`:''}${j.candidate_profile?`<div class="detail-section"><h3>Profil recherché</h3><p>${esc(j.candidate_profile)}</p></div>`:''}<div class="detail-section"><h3>Description</h3><p>${esc(j.description||'')}</p></div></div>`);
}
async function renderMyJobs(){
  if(state.session.user.role!=='recruiter')return;
  const d=await api('/api/recruiter/jobs'),paid=hasActivePaidPlan();
  $('#viewContent').innerHTML=`
    <div class="module-hero"><div><span class="section-kicker">MES PUBLICATIONS</span><h2>Gestion des offres</h2><p>Modifiez, dupliquez, publiez, masquez ou clôturez vos offres et suivez leur performance.</p></div><button class="btn primary" id="newJobFromMine">＋ Nouvelle offre</button></div>
    ${!paid?'<div class="visibility-notice"><b>Visibilité suspendue :</b> vos offres sont conservées, mais aucune n’est publique tant que votre abonnement payant n’est pas actif.</div>':''}
    <div class="admin-tabs recruiter-job-tabs"><button class="job-tab active" data-status="">Toutes</button><button class="job-tab" data-status="published">Publiées</button><button class="job-tab" data-status="draft">Brouillons</button><button class="job-tab" data-status="suspended">Masquées</button><button class="job-tab" data-status="closed">Clôturées</button></div>
    <div id="recruiterJobsList"></div>`;
  const draw=status=>{
    const rows=d.jobs.filter(j=>!status||j.status===status);
    $('#recruiterJobsList').innerHTML=`<div class="professional-list">${rows.map(j=>`<article class="manage-card recruiter-job-card">
      <div class="manage-main"><div class="card-topline"><span class="pill status-${esc(j.status)}">${esc(j.status||'draft')}</span><span class="visibility-label ${j.public_visible?'visible':'hidden-vis'}">${j.public_visible?'Visible publiquement':'Masquée'}</span></div><h3>${esc(j.title)}</h3><p><b>${esc(j.location||'Lieu non précisé')}</b> • ${esc(j.employment_type||'')} • ${new Date(j.created_at).toLocaleDateString('fr-FR')}</p><div class="job-performance"><span>◌ ${formatCount(j.view_count||0)} vue(s)</span><span>✓ ${formatCount(j.application_count||0)} candidature(s)</span></div></div>
      <div class="manage-actions">
        <button class="btn outline-blue recruiter-job-view" data-id="${j.id}">Voir</button>
        <button class="btn ghost recruiter-job-edit" data-id="${j.id}">Modifier</button>
        <button class="btn ghost recruiter-job-duplicate" data-id="${j.id}">Dupliquer</button>
        <select class="job-status" data-id="${j.id}"><option value="published" ${j.status==='published'?'selected':''}>Publier</option><option value="draft" ${j.status==='draft'?'selected':''}>Brouillon</option><option value="suspended" ${j.status==='suspended'?'selected':''}>Masquer</option><option value="closed" ${j.status==='closed'?'selected':''}>Clôturer</option></select>
        <button class="btn danger delete-job" data-id="${j.id}">Supprimer</button>
      </div>
    </article>`).join('')||'<div class="panel empty-state">Aucune offre dans cette catégorie.</div>'}</div>`;
    $$('.recruiter-job-view').forEach(b=>b.onclick=()=>recruiterJobDetail(Number(b.dataset.id)));
    $$('.recruiter-job-edit').forEach(b=>b.onclick=()=>editRecruiterJob(Number(b.dataset.id)));
    $$('.recruiter-job-duplicate').forEach(b=>b.onclick=async()=>{try{await api(`/api/recruiter/jobs/${b.dataset.id}/duplicate`,{method:'POST'});toast('Offre dupliquée en brouillon.');renderMyJobs()}catch(err){toast(err.message)}});
    $$('.job-status').forEach(s=>s.onchange=async()=>{try{await api(`/api/recruiter/jobs/${s.dataset.id}/status`,{method:'POST',body:JSON.stringify({status:s.value})});toast('Statut mis à jour.');renderMyJobs()}catch(err){toast(err.message)}});
    $$('.delete-job').forEach(b=>b.onclick=async()=>{if(!confirm('Supprimer définitivement cette offre et les candidatures associées ?'))return;try{await api(`/api/recruiter/jobs/${b.dataset.id}`,{method:'DELETE'});toast('Offre supprimée.');renderMyJobs()}catch(err){toast(err.message)}});
  };
  $('#newJobFromMine').onclick=()=>navigateView('jobs');
  $$('.job-tab').forEach(b=>b.onclick=()=>{$$('.job-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');draw(b.dataset.status)});
  draw('');
}
async function recruiterJobDetail(id){
  try{
    const d=await api(`/api/recruiter/jobs/${id}`),j=d.job;
    modal(`<div class="detail-popup"><div class="card-topline"><span class="pill">${esc(j.status)}</span><span>${formatCount(j.view_count||0)} vue(s) • ${formatCount(d.application_count)} candidature(s)</span></div><h2>${esc(j.title)}</h2><p><b>${esc(j.location||'')}</b> • ${esc(j.employment_type||'')}</p><div class="detail-grid"><div><small>Études</small><strong>${esc(j.education_required||'—')}</strong></div><div><small>Expérience</small><strong>${esc(j.experience_required||'—')}</strong></div><div><small>Rémunération</small><strong>${esc(j.salary||'—')}</strong></div><div><small>Postes</small><strong>${esc(j.vacancies||1)}</strong></div><div><small>Date limite</small><strong>${j.closes_at?formatDateFR(j.closes_at):'—'}</strong></div><div><small>Disponibilité</small><strong>${esc(j.availability_required||'—')}</strong></div></div>${j.responsibilities?`<div class="detail-section"><h3>Missions</h3><p>${esc(j.responsibilities)}</p></div>`:''}${j.skills_required?`<div class="detail-section"><h3>Compétences</h3><p>${esc(j.skills_required)}</p></div>`:''}<div class="detail-section"><h3>Description</h3><p>${esc(j.description||'')}</p></div><div class="detail-actions"><button class="btn primary go-applications">Voir les candidatures</button></div></div>`);
    $('.go-applications').onclick=()=>{closeModal();navigateView('applications')};
  }catch(err){toast(err.message)}
}
async function editRecruiterJob(id){
  try{
    const d=await api(`/api/recruiter/jobs/${id}`),j=d.job;
    modal(`<div class="edit-job-modal"><h2>Modifier l’offre</h2><form id="editJobForm" class="form-grid">
      <div class="field"><label>Intitulé *</label><input name="title" value="${esc(j.title)}" required></div><div class="field"><label>Métier</label><input name="profession" value="${esc(j.profession)}"></div><div class="field"><label>Catégorie</label><input name="category" value="${esc(j.category)}"></div><div class="field"><label>Contrat</label><input name="employment_type" value="${esc(j.employment_type)}"></div><div class="field"><label>Lieu</label><input name="location" value="${esc(j.location)}"></div><div class="field"><label>Rémunération</label><input name="salary" value="${esc(j.salary)}"></div><div class="field"><label>Postes</label><input name="vacancies" type="number" value="${esc(j.vacancies||1)}"></div><div class="field"><label>Statut</label><select name="status"><option value="published" ${j.status==='published'?'selected':''}>Publiée</option><option value="draft" ${j.status==='draft'?'selected':''}>Brouillon</option><option value="suspended" ${j.status==='suspended'?'selected':''}>Masquée</option><option value="closed" ${j.status==='closed'?'selected':''}>Clôturée</option></select></div>
      <div class="field"><label>Études</label><input name="education_required" value="${esc(j.education_required)}"></div><div class="field"><label>Expérience</label><input name="experience_required" value="${esc(j.experience_required)}"></div><div class="field full"><label>Missions</label><textarea name="responsibilities">${esc(j.responsibilities)}</textarea></div><div class="field full"><label>Compétences</label><textarea name="skills_required">${esc(j.skills_required)}</textarea></div><div class="field full"><label>Profil recherché</label><textarea name="candidate_profile">${esc(j.candidate_profile)}</textarea></div><div class="field full"><label>Description *</label><textarea name="description" rows="6" required>${esc(j.description)}</textarea></div>
      <input type="hidden" name="starts_at" value="${esc(j.starts_at)}"><input type="hidden" name="closes_at" value="${esc(j.closes_at)}"><input type="hidden" name="work_schedule" value="${esc(j.work_schedule)}"><input type="hidden" name="availability_required" value="${esc(j.availability_required)}">
      <div class="full"><button class="btn primary">Enregistrer les modifications</button></div></form></div>`);
    $('#editJobForm').onsubmit=async e=>{e.preventDefault();try{await api(`/api/recruiter/jobs/${id}`,{method:'PATCH',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});closeModal();toast('Offre modifiée.');renderMyJobs()}catch(err){toast(err.message)}};
  }catch(err){toast(err.message)}
}
async function renderRecruiterApplications(){
  if(state.session.user.role!=='recruiter')return $('#viewContent').innerHTML='<div class="panel">Section réservée aux recruteurs.</div>';
  const d=await api('/api/recruiter/applications');
  const groups={submitted:0,reviewing:0,accepted:0,rejected:0};d.applications.forEach(a=>groups[a.status]=(groups[a.status]||0)+1);
  $('#viewContent').innerHTML=`
    <div class="module-hero"><div><span class="section-kicker">CANDIDATURES</span><h2>Postulants à mes offres</h2><p>Analysez les profils et suivez chaque candidature jusqu’à la décision finale.</p></div></div>
    <div class="mini-metrics"><div><strong>${formatCount(d.applications.length)}</strong><span>Total</span></div><div><strong>${formatCount(groups.submitted)}</strong><span>Nouvelles</span></div><div><strong>${formatCount(groups.reviewing)}</strong><span>À l’étude</span></div><div><strong>${formatCount(groups.accepted)}</strong><span>Acceptées</span></div></div>
    <div class="application-cards">${d.applications.map(a=>`<article class="application-card">
      <div class="card-topline"><span class="pill status-${esc(a.status)}">${esc(a.status||'submitted')}</span><small>${new Date(a.created_at).toLocaleString('fr-FR')}</small></div>
      <h3>${esc(((a.first_name||'')+' '+(a.last_name||'')).trim()||a.email)}</h3><p><b>${esc(a.professional_title||a.profession||'Candidat')}</b> • ${esc(a.city||a.country||'')}</p>
      <div class="application-info"><span><small>Offre</small>${esc(a.title)}</span><span><small>Téléphone</small>${esc(a.phone||'—')}</span><span><small>E-mail</small>${esc(a.email||'—')}</span><span><small>Expérience</small>${esc(a.experience_level||a.experience_years||'—')}</span></div>
      <p>${esc((a.skills||a.description||'').slice(0,240))}</p>
      ${a.message?`<div class="application-message"><b>Message :</b> ${esc(a.message)}</div>`:''}
      <div class="application-actions">
        <button class="btn outline-blue applicant-detail" data-id="${a.id}">Voir le profil</button>
        <button class="btn ghost message-user" data-id="${a.candidate_id}">Message</button>
        <select class="application-status" data-id="${a.id}" ${a.status==='cancelled'?'disabled title="Candidature annulée par le demandeur"':''}>${a.status==='cancelled'?'<option selected>Annulée par le candidat</option>':`<option value="submitted" ${a.status==='submitted'?'selected':''}>Nouvelle</option><option value="reviewing" ${a.status==='reviewing'?'selected':''}>À l’étude</option><option value="shortlisted" ${a.status==='shortlisted'?'selected':''}>Présélectionnée</option><option value="interview" ${a.status==='interview'?'selected':''}>Entretien</option><option value="accepted" ${a.status==='accepted'?'selected':''}>Acceptée</option><option value="rejected" ${a.status==='rejected'?'selected':''}>Refusée</option>`}</select>
      </div>
    </article>`).join('')||'<div class="empty-state panel">Aucune candidature reçue pour le moment.</div>'}</div>`;
  const byId=new Map(d.applications.map(a=>[String(a.id),a]));
  $$('.applicant-detail').forEach(b=>b.onclick=()=>{const a=byId.get(b.dataset.id);modal(`<h2>${esc(((a.first_name||'')+' '+(a.last_name||'')).trim()||a.email)}</h2><div class="detail-grid"><div><small>Profil</small><strong>${esc(a.professional_title||a.profession||'—')}</strong></div><div><small>Ville</small><strong>${esc(a.city||a.country||'—')}</strong></div><div><small>Téléphone</small><strong>${esc(a.phone||'—')}</strong></div><div><small>E-mail</small><strong>${esc(a.email||'—')}</strong></div><div><small>Expérience</small><strong>${esc(a.experience_level||a.experience_years||'—')}</strong></div><div><small>Disponibilité</small><strong>${esc(a.availability||'—')}</strong></div></div><div class="detail-section"><h3>Compétences</h3><p>${esc(a.skills||'—')}</p></div><div class="detail-section"><h3>Recherche</h3><p>${esc(a.target_position||'—')} • ${esc(a.desired_contracts||'')}</p></div><div class="detail-actions"><button class="btn primary modal-message" data-id="${a.candidate_id}">Envoyer un message</button></div>`);$('.modal-message').onclick=()=>{closeModal();messageModal(Number(a.candidate_id))}});
  $$('.message-user').forEach(b=>b.onclick=()=>messageModal(Number(b.dataset.id)));
  $$('.application-status').forEach(s=>s.onchange=async()=>{try{await api(`/api/recruiter/applications/${s.dataset.id}/status`,{method:'POST',body:JSON.stringify({status:s.value})});toast('Statut de candidature mis à jour.');renderRecruiterApplications()}catch(err){toast(err.message)}});
}

async function renderMyApplications(){
  if(state.session.user.role!=='candidate')return;
  const d=await api('/api/candidate/applications');
  const labels={submitted:'Envoyée',reviewing:'À l’étude',shortlisted:'Présélectionnée',interview:'Entretien',accepted:'Acceptée',rejected:'Refusée',cancelled:'Annulée'};
  $('#viewContent').innerHTML=`
    <div class="module-hero"><div><span class="section-kicker">SUIVI DE CANDIDATURES</span><h2>Mes candidatures</h2><p>Suivez chaque démarche, annulez-la temporairement ou retirez-la définitivement de vos espaces Demandeur/Recruteur.</p></div><span class="status-badge">${formatCount(d.applications.length)} candidature(s)</span></div>
    <div class="market-search candidate-app-filter"><div class="field"><label>Recherche</label><input id="candidateAppQ" placeholder="Entreprise ou poste…"></div><div class="field"><label>Statut</label><select id="candidateAppStatus"><option value="">Tous</option><option value="submitted">Envoyées</option><option value="reviewing">À l’étude</option><option value="shortlisted">Présélectionnées</option><option value="interview">Entretien</option><option value="accepted">Acceptées</option><option value="rejected">Refusées</option><option value="cancelled">Annulées</option></select></div><button id="candidateAppFilterBtn" class="btn primary">Filtrer</button></div>
    <div id="candidateAppList"></div>`;
  const act=async(id,action,label)=>{
    const questions={cancel:'Annuler cette candidature ? Elle pourra ensuite être réactivée ou retirée.',reactivate:'Réactiver cette candidature et la remettre au statut Envoyée ?',withdraw:'Retirer cette candidature ? Elle disparaîtra de votre compte et de la liste du recruteur.'};
    if(!confirm(questions[action]||'Confirmer cette action ?'))return;
    try{await api(`/api/candidate/applications/${id}/action`,{method:'POST',body:JSON.stringify({action})});toast(label);renderMyApplications()}catch(err){toast(err.message)}
  };
  const draw=()=>{
    const q=$('#candidateAppQ').value.toLowerCase().trim(),st=$('#candidateAppStatus').value;
    const rows=d.applications.filter(a=>(!st||a.status===st)&&(!q||`${a.title} ${a.company_name||''}`.toLowerCase().includes(q)));
    $('#candidateAppList').innerHTML=`<div class="professional-list">${rows.map(a=>`<article class="manage-card candidate-application-card"><div><div class="card-topline"><span class="pill status-${esc(a.status)}">${esc(labels[a.status]||a.status)}</span><small>${new Date(a.created_at).toLocaleDateString('fr-FR')}</small></div><h3>${esc(a.title)}</h3><p><b>${esc(a.company_name||'Entreprise')}</b> • ${esc(a.location||'')}</p><p class="muted">${esc(a.employment_type||'')} ${a.salary?'• '+esc(a.salary):''}</p><div class="application-timeline"><span class="${['submitted','reviewing','shortlisted','interview','accepted'].includes(a.status)?'done':''}">Envoyée</span><span class="${['reviewing','shortlisted','interview','accepted'].includes(a.status)?'done':''}">Étude</span><span class="${['shortlisted','interview','accepted'].includes(a.status)?'done':''}">Présélection</span><span class="${['interview','accepted'].includes(a.status)?'done':''}">Entretien</span><span class="${a.status==='accepted'?'done':a.status==='rejected'?'rejected':a.status==='cancelled'?'cancelled':''}">${a.status==='rejected'?'Refusée':a.status==='cancelled'?'Annulée':'Décision'}</span></div></div><div class="manage-actions"><button class="btn outline-blue myapp-detail" data-id="${a.job_id}">Voir l’offre</button>${a.status==='cancelled'?`<button class="btn primary myapp-reactivate" data-id="${a.id}">Réactiver</button><button class="btn danger myapp-withdraw" data-id="${a.id}">Retirer</button>`:`<button class="btn danger myapp-cancel" data-id="${a.id}">Annuler</button>`}</div></article>`).join('')||'<div class="panel empty-state">Aucune candidature dans cette catégorie.</div>'}</div>`;
    $$('.myapp-detail').forEach(b=>b.onclick=()=>openJobDetail(Number(b.dataset.id)));
    $$('.myapp-cancel').forEach(b=>b.onclick=()=>act(Number(b.dataset.id),'cancel','Candidature annulée.'));
    $$('.myapp-reactivate').forEach(b=>b.onclick=()=>act(Number(b.dataset.id),'reactivate','Candidature réactivée.'));
    $$('.myapp-withdraw').forEach(b=>b.onclick=()=>act(Number(b.dataset.id),'withdraw','Candidature retirée.'));
  };
  $('#candidateAppFilterBtn').onclick=draw;$('#candidateAppQ').oninput=draw;$('#candidateAppStatus').onchange=draw;draw();
}

async function renderRecruitmentRequests(){
  if(state.session.user.role!=='candidate')return $('#viewContent').innerHTML='<div class="panel">Section réservée aux demandeurs d’emploi.</div>';
  const d=await api('/api/candidate/recruitment-requests');
  $('#viewContent').innerHTML=`
    <div class="module-hero"><div><span class="section-kicker">PROPOSITIONS</span><h2>Propositions de recrutement</h2><p>Consultez les recruteurs intéressés par votre profil, répondez ou retirez une proposition de votre espace personnel.</p></div></div>
    <div class="application-cards">${d.requests.map(r=>`<article class="application-card">
      <div class="card-topline"><span class="pill status-${esc(r.status)}">${esc(r.status||'sent')}</span><small>${new Date(r.created_at).toLocaleString('fr-FR')}</small></div>
      <h3>${esc(r.company_name||r.trade_name||'Recruteur GLOBAL EMPLOI')}</h3><p>${esc(r.job_title||r.email||'Recruteur')}</p>
      ${r.message?`<div class="application-message">${esc(r.message)}</div>`:''}
      <div class="application-actions">
        <button class="btn ghost message-user" data-id="${r.recruiter_id}">Message</button>
        ${r.status==='sent'?`<button class="btn primary rr-action" data-id="${r.id}" data-status="accepted">Accepter</button><button class="btn danger rr-action" data-id="${r.id}" data-status="declined">Décliner</button>`:''}
        <button class="btn outline-blue rr-delete" data-id="${r.id}">Supprimer de mon espace</button>
      </div>
    </article>`).join('')||'<div class="panel empty-state">Aucune proposition reçue pour le moment.</div>'}</div>`;
  $$('.message-user').forEach(b=>b.onclick=()=>messageModal(Number(b.dataset.id)));
  $$('.rr-action').forEach(b=>b.onclick=async()=>{try{await api(`/api/candidate/recruitment-requests/${b.dataset.id}/status`,{method:'POST',body:JSON.stringify({status:b.dataset.status})});toast('Votre réponse a été enregistrée.');renderRecruitmentRequests()}catch(err){toast(err.message)}});
  $$('.rr-delete').forEach(b=>b.onclick=async()=>{if(!confirm('Supprimer cette proposition de votre espace ? La copie administrative restera conservée.'))return;try{await api(`/api/candidate/recruitment-requests/${b.dataset.id}`,{method:'DELETE'});toast('Proposition supprimée de votre espace.');renderRecruitmentRequests()}catch(err){toast(err.message)}});
}

async function renderCandidates(){
  const role=state.session.user.role;
  $('#viewContent').innerHTML=`
    <div class="module-hero"><div><span class="section-kicker">TALENTS</span><h2>Recherche avancée de candidats</h2><p>Filtrez les profils visibles par métier, ville, expérience, études et disponibilité.</p></div></div>
    <div class="market-search candidate-pro-search">
      <div class="field"><label>Métier / compétence</label><input id="memberCandQ" placeholder="Comptable, Maçon, Chauffeur…"></div>
      <div class="field"><label>Ville</label><input id="memberCandCity" placeholder="Abidjan, Bouaké…"></div>
      <div class="field"><label>Expérience</label><input id="memberCandExp" placeholder="1 à 3 ans, 5 ans…"></div>
      <div class="field"><label>Niveau d’études</label><input id="memberCandEdu" placeholder="BAC, BTS, Licence…"></div>
      <div class="field"><label>Disponibilité</label><input id="memberCandAvail" placeholder="Immédiatement…"></div>
      <button id="memberCandSearch" class="btn primary">Rechercher</button>
    </div>
    <div id="memberCandCount" class="results-count"></div><div id="memberCandGrid" class="candidate-market-grid"><div class="page-skeleton compact"><span></span><span></span></div></div><div id="memberCandPagination" class="public-pagination"></div>`;
  const load=async(page=1)=>{
    try{
      const qs=new URLSearchParams({q:$('#memberCandQ').value.trim(),city:$('#memberCandCity').value.trim(),experience:$('#memberCandExp').value.trim(),education:$('#memberCandEdu').value.trim(),availability:$('#memberCandAvail').value.trim(),page:String(page),per_page:'12'});
      const d=await api(`/api/candidates?${qs}`),pg=d.pagination||{page:1,pages:1,total:d.candidates.length};
      $('#memberCandCount').textContent=`${formatCount(pg.total)} talent${pg.total>1?'s':''} disponible${pg.total>1?'s':''} • Page ${pg.page}/${pg.pages}`;
      $('#memberCandGrid').innerHTML=d.candidates.length?d.candidates.map(c=>`<article class="candidate-market-card professional-card"><div class="candidate-photo">${c.photo?`<img src="${esc(c.photo)}" alt="">`:`<span>${esc(((c.first_name||'P')[0]||'P')+((c.last_name||'')[0]||''))}</span>`}</div><div class="candidate-body"><div class="card-topline"><span class="pill">${esc(c.availability||'Profil')}</span><span class="plan-mini">${esc((c.plan||'standard').toUpperCase())}</span></div><h3>${esc(`${c.first_name||''} ${c.last_name||''}`.trim()||'Professionnel')}</h3><strong>${esc(c.professional_title||c.profession||'Profil professionnel')}</strong><p class="muted">⌖ ${esc(c.city||c.country||'')} • ${esc(c.experience_level||'Expérience non précisée')}</p><p>${esc((c.skills||c.specialty||'').slice(0,160))}</p></div><div class="candidate-card-footer"><button class="btn outline-blue cand-detail" data-id="${c.id}">Voir profil</button>${role==='recruiter'?`<button class="btn primary cand-recruit" data-id="${c.id}">Je recrute</button>`:''}</div></article>`).join(''):'<div class="panel empty-state">Aucun profil ne correspond aux filtres.</div>';
      $$('.cand-detail').forEach(b=>b.onclick=()=>openCandidateDetail(Number(b.dataset.id)));
      $$('.cand-recruit').forEach(b=>b.onclick=()=>requirePaidRecruiterAction(()=>recruitFromPublic(Number(b.dataset.id))));
      renderDirectoryPagination('#memberCandPagination',pg,p=>load(p));
    }catch(err){$('#memberCandCount').textContent='';const grid=$('#memberCandGrid');grid.innerHTML=directoryError('Impossible de charger les talents.',err,()=>load(page));bindDirectoryRetry(grid,()=>load(page))}
  };
  $('#memberCandSearch').onclick=()=>load(1);await load(1);
}
function messageModal(receiver){modal(`<h2>Envoyer un message</h2><form id="messageForm"><div class="field"><label>Message</label><textarea name="content" required></textarea></div><br><button class="btn primary">Envoyer</button></form>`);$('#messageForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/messages',{method:'POST',body:JSON.stringify({receiver_id:receiver,content:new FormData(e.target).get('content')})});closeModal();toast('Message envoyé')}catch(err){toast(err.message)}}}
async function renderMessages(){
  if(state.session.user.role==='super_admin'){
    const [d,u]=await Promise.all([api('/api/admin/messages'),api('/api/admin/users')]);
    const members=asList(u.users).filter(x=>x.role!=='super_admin');
    const support=asList(d.support_messages),privateMessages=asList(d.private_messages);
    $('#viewContent').innerHTML=`
      <div class="module-hero"><div><span class="section-kicker">MESSAGERIE ADMIN</span><h2>Messages</h2><p>Consultez les demandes au support et l’activité de messagerie enregistrée sur la plateforme.</p></div><div class="report-actions"><button id="refreshAdminMessages" class="btn outline-blue">Actualiser</button><button id="newSupportMessage" class="btn primary">Nouveau message</button></div></div>
      <div class="inbox-metrics"><button class="inbox-metric active admin-message-mode" data-mode="support"><strong>${formatCount(support.length)}</strong><span>Support</span></button><button class="inbox-metric admin-message-mode" data-mode="private"><strong>${formatCount(privateMessages.length)}</strong><span>Messages plateforme</span></button></div>
      <div id="supportStatusTabs" class="admin-tabs"><button class="support-tab active" data-status="">Tous</button><button class="support-tab" data-status="unread">Non lus</button><button class="support-tab" data-status="read">Lus</button><button class="support-tab" data-status="archived">Archivés</button></div>
      <div id="supportMessagesList"></div>`;
    let mode='support',status='';
    const draw=()=>{
      const box=$('#supportMessagesList');
      $('#supportStatusTabs').classList.toggle('hidden',mode!=='support');
      if(mode==='private'){
        box.innerHTML=`<div class="panel"><h3>Messages enregistrés sur la plateforme</h3><div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Expéditeur</th><th>Destinataire(s)</th><th>Conversation</th><th>Message</th></tr></thead><tbody>${privateMessages.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString('fr-FR')}</td><td>${esc(x.sender_email||'Système')}</td><td>${esc(x.recipient_emails||'—')}</td><td>#${esc(x.conversation_id||'—')}</td><td>${esc((x.content||'').slice(0,300))}</td></tr>`).join('')||'<tr><td colspan="5">Aucun message de plateforme.</td></tr>'}</tbody></table></div></div>`;
        return;
      }
      const rows=support.filter(x=>!status||x.status===status);
      box.innerHTML=`<div class="application-cards">${rows.map(x=>`<article class="application-card ${x.status==='unread'?'support-unread':''}"><div class="card-topline"><span class="pill">${esc(x.category||'support')}</span><small>${new Date(x.created_at).toLocaleString('fr-FR')}</small></div><h3>${esc(x.subject||'Message support')}</h3><p><b>De :</b> ${esc(x.sender_email||'Système')} ${x.recipient_email?`<br><b>À :</b> ${esc(x.recipient_email)}`:''}</p><p>${esc(x.content)}</p><div class="application-actions">${x.sender_user_id&&x.sender_user_id!==state.session.user.id?`<button class="btn primary support-reply" data-user="${x.sender_user_id}">Répondre</button>`:''}<button class="btn outline-blue support-status" data-id="${x.id}" data-status="read">Marquer lu</button><button class="btn ghost support-status" data-id="${x.id}" data-status="archived">Archiver</button></div></article>`).join('')||'<div class="panel empty-state">Aucun message support.</div>'}</div>`;
      $$('.support-status').forEach(b=>b.onclick=async()=>{try{await api(`/api/support/messages/${b.dataset.id}/status`,{method:'POST',body:JSON.stringify({status:b.dataset.status})});toast('Message mis à jour.');renderMessages()}catch(err){toast(err.message)}});
      $$('.support-reply').forEach(b=>b.onclick=()=>supportCompose(Number(b.dataset.user),members));
    };
    $$('.admin-message-mode').forEach(b=>b.onclick=()=>{$$('.admin-message-mode').forEach(x=>x.classList.remove('active'));b.classList.add('active');mode=b.dataset.mode;draw()});
    $$('.support-tab').forEach(b=>b.onclick=()=>{$$('.support-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');status=b.dataset.status;draw()});
    $('#refreshAdminMessages').onclick=()=>renderMessages();
    $('#newSupportMessage').onclick=()=>supportCompose(null,members);draw();
    return;
  }
  const d=await api('/api/conversations');
  $('#viewContent').innerHTML=`
    <div class="module-hero"><div><span class="section-kicker">MESSAGERIE</span><h2>Mes conversations</h2><p>Échangez directement avec vos correspondants professionnels. Les messages reçus peuvent être masqués uniquement de votre espace.</p></div><button id="contactSupportFromMessages" class="btn outline-blue">Contacter le support</button></div>
    <div class="conversation-list">${d.conversations.map(x=>`<button class="conversation-row open-conv" data-id="${x.id}" data-other="${x.other_user_id||''}"><div class="conversation-avatar">${esc((x.other_name||x.other_email||'GE').slice(0,2).toUpperCase())}</div><div class="conversation-copy"><strong>${esc(x.other_name||x.other_email||'Correspondant')}</strong><small>${esc(x.other_role||'')}</small><p>${esc(x.last_message||'Aucun message')}</p></div><span>→</span></button>`).join('')||'<div class="panel empty-state">Aucune conversation pour le moment.</div>'}</div>`;
  $('#contactSupportFromMessages')?.addEventListener('click',()=>openMemberSupportModal());
  $$('.open-conv').forEach(b=>b.onclick=()=>openConversationModal(Number(b.dataset.id),Number(b.dataset.other)));
}
function supportCompose(preselected,members){
  modal(`<h2>Message support</h2><form id="supportComposeForm" class="form-grid"><div class="field full"><label>Destinataire</label><select name="recipient_user_id" required><option value="">Choisir un membre</option>${members.map(x=>`<option value="${x.id}" ${Number(preselected)===Number(x.id)?'selected':''}>${esc(x.email)} — ${x.role==='candidate'?'Demandeur':'Recruteur'}</option>`).join('')}</select></div><div class="field"><label>Catégorie</label><select name="category"><option value="support">Support</option><option value="subscription">Abonnement</option><option value="verification">Vérification</option><option value="account">Compte</option></select></div><div class="field"><label>Objet</label><input name="subject" required></div><div class="field full"><label>Message</label><textarea name="content" rows="6" required></textarea></div><div class="full"><button class="btn primary">Envoyer</button></div></form>`);
  $('#supportComposeForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/support/messages',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});closeModal();toast('Message support envoyé.');renderMessages()}catch(err){toast(err.message)}};
}

function openMemberSupportModal(defaultCategory='support'){
  if(state.session?.user?.role==='super_admin')return;
  modal(`<div class="support-client-modal"><span class="section-kicker">SUPPORT GLOBAL EMPLOI</span><h2>Contacter le support GLOBAL EMPLOI</h2><p class="muted">Envoyez une demande administrative au Super Admin sans utiliser vos conversations privées.</p><form id="memberSupportPopupForm" class="form-grid"><div class="field"><label>Objet</label><input name="subject" required></div><div class="field"><label>Catégorie</label><select name="category"><option value="support" ${defaultCategory==='support'?'selected':''}>Support</option><option value="subscription" ${defaultCategory==='subscription'?'selected':''}>Abonnement</option><option value="verification" ${defaultCategory==='verification'?'selected':''}>Vérification</option><option value="account" ${defaultCategory==='account'?'selected':''}>Compte</option></select></div><div class="field full"><label>Message</label><textarea name="content" rows="6" required></textarea></div><div class="full"><button class="btn primary">Envoyer au support</button></div></form></div>`);
  $('#memberSupportPopupForm').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;try{if(btn){btn.disabled=true;btn.textContent='Envoi…'}await api('/api/support/messages',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});closeModal();toast('Votre demande a été envoyée au support GLOBAL EMPLOI.')}catch(err){toast(err.message);if(btn){btn.disabled=false;btn.textContent='Envoyer au support'}}};
}

async function openConversationModal(conversationId,receiver){
  try{
    const m=await api(`/api/messages?conversation_id=${conversationId}`);
    modal(`<div class="conversation-modal"><h2>Conversation</h2><div class="message-thread">${m.messages.map(x=>{const mine=Number(x.sender_id)===Number(state.session.user.id);return `<div class="chat-message ${mine?'mine':'theirs'}"><div><small>${mine?'Moi':'Correspondant'} • ${new Date(x.created_at).toLocaleString('fr-FR')}</small><p>${esc(x.content)}</p></div>${!mine?`<button type="button" class="message-delete-client" data-id="${x.id}" title="Supprimer de mon espace">Supprimer</button>`:''}</div>`}).join('')||'<div class="empty-state">Aucun message visible.</div>'}</div>${receiver?`<form id="replyForm" class="reply-form"><textarea name="content" placeholder="Écrire un message…" required></textarea><button class="btn primary">Envoyer</button></form>`:''}</div>`);
    $$('.message-delete-client').forEach(b=>b.onclick=async()=>{if(!confirm('Supprimer ce message reçu de votre espace ? La copie administrative et celle de l’expéditeur ne seront pas supprimées.'))return;try{await api(`/api/messages/${b.dataset.id}`,{method:'DELETE'});toast('Message supprimé de votre espace.');openConversationModal(conversationId,receiver)}catch(err){toast(err.message)}});
    if(receiver)$('#replyForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/messages',{method:'POST',body:JSON.stringify({receiver_id:receiver,content:new FormData(e.target).get('content')})});toast('Message envoyé.');openConversationModal(conversationId,receiver)}catch(err){toast(err.message)}};
  }catch(err){toast(err.message)}
}

async function renderNotifications(){
  const d=await api('/api/notifications');
  const items=(d.notifications||[]).map(n=>({...n,is_read:Number(n.is_read)===1}));
  const unread=items.filter(n=>!n.is_read).length;
  $('#viewContent').innerHTML=`
    <div class="module-hero"><div><span class="section-kicker">CENTRE D’ALERTES</span><h2>Notifications</h2><p>${unread} notification${unread>1?'s':''} non lue${unread>1?'s':''}. L’état lu/non lu est enregistré dans votre compte.</p></div><div class="notification-head-actions"><button id="contactSupportFromNotifications" class="btn outline-blue">Contacter le support</button>${unread?'<button id="markAllRead" class="btn primary">Tout marquer comme lu</button>':''}</div></div>
    <div class="notification-list">${items.map(n=>`<article class="notification-card notification-click ${n.is_read?'read':'unread'}" data-id="${n.id}" data-type="${esc(n.type)}" data-read="${n.is_read?'1':'0'}"><span class="notification-dot"></span><div class="notification-main"><div class="card-topline"><strong>${esc(n.title)}</strong><small>${new Date(n.created_at).toLocaleString('fr-FR')}</small></div><p>${esc(n.content)}</p><small class="pill">${esc(n.type)}</small></div><button type="button" class="notification-delete" data-id="${n.id}">Supprimer</button></article>`).join('')||'<div class="panel empty-state">Aucune notification.</div>'}</div>`;
  $('#contactSupportFromNotifications')?.addEventListener('click',()=>openMemberSupportModal());
  $('#markAllRead')?.addEventListener('click',async()=>{try{await api('/api/notifications/read-all',{method:'POST'});toast('Notifications marquées comme lues.');renderNotifications()}catch(err){toast(err.message)}});
  $$('.notification-delete').forEach(b=>b.onclick=async e=>{e.stopPropagation();if(!confirm('Supprimer cette notification de votre compte ?'))return;try{await api(`/api/notifications/${b.dataset.id}`,{method:'DELETE'});toast('Notification supprimée.');renderNotifications()}catch(err){toast(err.message)}});
  $$('.notification-click').forEach(card=>card.onclick=async e=>{
    if(e.target.closest('.notification-delete'))return;
    const id=Number(card.dataset.id),type=card.dataset.type,role=state.session.user.role;
    if(card.dataset.read!=='1'){try{await api(`/api/notifications/${id}/read`,{method:'POST'});card.dataset.read='1';card.classList.remove('unread');card.classList.add('read')}catch(err){toast(err.message);return}}
    if(type==='application')navigateView(role==='candidate'?'myapplications':'applications');
    else if(type==='recruitment')navigateView(role==='candidate'?'recruitment':'candidates');
    else if(type==='support')role==='super_admin'?navigateView('messages'):openMemberSupportModal();
    else if(type==='subscription'){if(role!=='super_admin')navigateView('subscription')}
    else if(type==='message')navigateView('messages');
  });
}

function renderSubscription(){
  if(state.session.user.role==='super_admin'){navigateView('dashboard');return;}
  const s=state.session.subscription;
  const current=s?.plan?.toUpperCase()||'AUCUN', active=s?.effective_status==='active';
  const paidActive=active&&['standard','business'].includes(String(s?.plan||'').toLowerCase());
  $('#viewContent').innerHTML=`
    <div class="module-hero"><div><span class="section-kicker">ABONNEMENT</span><h2>Choisissez votre niveau d’accès</h2><p>Votre formule détermine la visibilité de vos publications et l’accès aux actions de recrutement.</p></div><div class="dashboard-plan light-plan"><small>FORMULE ACTUELLE</small><strong>${current}</strong><span>${active?'Active':'Expirée'} ${s?.expires_at?'• '+new Date(s.expires_at).toLocaleDateString('fr-FR'):''}</span></div></div>
    <div class="plans professional-plans">
      <div class="plan"><h3>FREE</h3><div class="price">0 F</div><p>Consultation permanente</p><ul><li>✓ Consultation des contenus</li><li>✓ Préparation du profil/publications</li><li>✕ ${state.session.user.role==='candidate'?'Je postule':'Je recrute'}</li><li>✕ ${state.session.user.role==='candidate'?'Profil visible aux recruteurs':'Offres visibles au public'}</li></ul><small class="free-warning">Le compte FREE reste accessible pour consulter la plateforme. STANDARD ou BUSINESS est requis pour les actions professionnelles et la visibilité publique.</small></div>
      <div class="plan featured"><h3>STANDARD</h3><div class="price">1 000 F</div><p>30 jours</p><ul><li>✓ Publications visibles</li><li>✓ Je postule / Je recrute</li><li>✓ Messagerie et suivi</li></ul>${paidActive?'<span class="status-badge active">Abonnement payant déjà actif</span>':'<a class="btn primary" href="https://pay.wave.com/m/M_ci_Enx-2JNAklk-/c/ci/?amount=1000" target="_blank" rel="noopener">Payer 1 000 F avec Wave</a>'}</div>
      <div class="plan"><h3>BUSINESS</h3><div class="price">10 000 F</div><p>365 jours</p><ul><li>✓ Accès complet</li><li>✓ Visibilité longue durée</li><li>✓ Toutes les fonctions professionnelles</li></ul>${paidActive?'<span class="status-badge active">Abonnement payant déjà actif</span>':'<a class="btn primary" href="https://pay.wave.com/m/M_ci_Enx-2JNAklk-/c/ci/?amount=10000" target="_blank" rel="noopener">Payer 10 000 F avec Wave</a>'}</div>
    </div>
    ${paidActive?`<div class="panel subscription-current subscription-locked"><div><h3>Abonnement payant en cours</h3><p class="muted">Vous ne pouvez pas envoyer une nouvelle demande « Activer mon abonnement » tant que votre accès ${esc(current)} est actif${s?.expires_at?' jusqu’au '+new Date(s.expires_at).toLocaleDateString('fr-FR'):''}.</p></div></div>`:`<div class="panel subscription-current"><div><h3>Activation après paiement</h3><p class="muted">Après votre paiement Wave, transmettez le numéro utilisé et l’ID de transaction au support.</p></div><button id="activateBtn" class="btn primary">Activer mon abonnement</button></div>`}`;
  if(!paidActive)$('#activateBtn').onclick=activationModal;
}

function activationModal(){const sub=state.session?.subscription;if(sub?.effective_status==='active'&&['standard','business'].includes(String(sub?.plan||'').toLowerCase())){toast('Vous possédez déjà un abonnement payant actif. Une nouvelle activation sera disponible après son expiration.');return;}modal(`<h2>Activer mon abonnement</h2><form id="activationForm" class="form-grid"><div class="field full"><label>Version achetée</label><select name="plan"><option value="standard">STANDARD — 1 000 FCFA</option><option value="business">BUSINESS — 10 000 FCFA</option></select></div><div class="field"><label>N° téléphone ayant payé</label><input name="payer_phone" required></div><div class="field"><label>ID de transaction</label><input name="transaction_id" required></div><div class="full" style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" id="waSend" class="btn ghost">Envoyer par WhatsApp</button><button class="btn primary">Envoyer au Support</button></div></form>`);$('#waSend').onclick=()=>{const f=new FormData($('#activationForm')),plan=f.get('plan'),amount=plan==='business'?10000:1000;const txt=`Demande d'activation GLOBAL EMPLOI\nCompte : ${state.session.user.email}\nType : ${state.session.user.role}\nFormule : ${plan}\nMontant : ${amount} FCFA\nTéléphone paiement : ${f.get('payer_phone')||''}\nID transaction : ${f.get('transaction_id')||''}`;window.open(`https://wa.me/2250777041790?text=${encodeURIComponent(txt)}`,'_blank')};$('#activationForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/subscription-request',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});closeModal();toast('Demande envoyée au support')}catch(err){toast(err.message)}}}


async function renderPayments(){
  if(state.session.user.role==='super_admin')return renderAdminReports();
  const d=await api('/api/subscription-history');
  $('#viewContent').innerHTML=`
    <div class="module-hero"><div><span class="section-kicker">PAIEMENTS</span><h2>Historique des abonnements</h2><p>Suivez les formules activées et toutes vos demandes de validation de paiement.</p></div></div>
    <div class="dashboard-columns">
      <div class="panel"><h3>Formules enregistrées</h3><div class="table-wrap"><table class="table"><thead><tr><th>Formule</th><th>Début</th><th>Expiration</th><th>Statut</th></tr></thead><tbody>${d.subscriptions.map(x=>`<tr><td><b>${esc(x.plan.toUpperCase())}</b></td><td>${new Date(x.started_at).toLocaleDateString('fr-FR')}</td><td>${x.plan==='free'?'Sans expiration':new Date(x.expires_at).toLocaleDateString('fr-FR')}</td><td><span class="pill">${esc(x.status)}</span></td></tr>`).join('')||'<tr><td colspan="4">Aucun abonnement.</td></tr>'}</tbody></table></div></div>
      <div class="panel"><h3>Demandes d’activation</h3><div class="payment-history">${d.requests.map(x=>`<article class="payment-record"><div class="card-topline"><b>${esc(x.plan.toUpperCase())} — ${formatCount(x.amount)} F</b><span class="pill">${esc(x.status)}</span></div><p>Téléphone : ${esc(x.payer_phone)}<br>ID transaction : ${esc(x.transaction_id)}</p><small>Demandé le ${new Date(x.created_at).toLocaleString('fr-FR')}${x.processed_at?' • traité le '+new Date(x.processed_at).toLocaleString('fr-FR'):''}</small>${x.admin_note?`<p class="muted">${esc(x.admin_note)}</p>`:''}</article>`).join('')||'<p class="muted">Aucune demande envoyée.</p>'}</div></div>
    </div>`;
}

async function renderSettings(){
  const admin=state.session.user.role==='super_admin';
  if(admin){
    let cfg={},settingsError='';try{cfg=(await api('/api/admin/settings')).settings||{}}catch(err){settingsError=err.message||'Impossible de lire la configuration';}
    $('#viewContent').innerHTML=`
      <div class="module-hero"><div><span class="section-kicker">PARAMÈTRES GÉNÉRAUX</span><h2>Configuration GLOBAL EMPLOI</h2><p>Gérez les paramètres fonctionnels de la plateforme. Les Secrets Cloudflare restent volontairement invisibles.</p></div><div class="report-actions"><span class="status-badge ${settingsError?'':'active'}">${settingsError?'Valeurs locales de secours':'Données D1 synchronisées'}</span><button id="refreshAdminSettings" class="btn outline-blue">Actualiser</button></div></div>${settingsError?`<div class="panel error-panel"><p>${esc(settingsError)}</p><p class="muted">Le formulaire reste disponible avec les valeurs par défaut. Cliquez sur Actualiser après vérification de D1.</p></div>`:''}
      <div class="dashboard-columns admin-settings-grid">
        <div class="panel"><h3>Identité & support</h3><form id="adminSettingsForm" class="form-grid">
          <div class="field"><label>Nom de la plateforme</label><input name="platform_name" value="${esc(cfg.platform_name||'GLOBAL EMPLOI')}"></div>
          <div class="field"><label>WhatsApp support</label><input name="support_whatsapp" value="${esc(cfg.support_whatsapp||'+2250777041790')}"></div>
          <div class="field full"><label>Lien de paiement Wave</label><input name="wave_payment_url" value="${esc(cfg.wave_payment_url||'https://pay.wave.com/m/M_ci_Enx-2JNAklk-/c/ci/?amount=')}"></div>
          <div class="field"><label>Prix STANDARD (FCFA)</label><input name="standard_price" type="number" value="${esc(cfg.standard_price||'1000')}"></div>
          <div class="field"><label>Prix BUSINESS (FCFA)</label><input name="business_price" type="number" value="${esc(cfg.business_price||'10000')}"></div>
          <div class="field"><label>Formule FREE</label><input value="Consultation permanente" readonly></div>
          <div class="field"><label>Durée STANDARD (jours)</label><input name="standard_days" type="number" value="${esc(cfg.standard_days||'30')}"></div>
          <div class="field"><label>Durée BUSINESS (jours)</label><input name="business_days" type="number" value="${esc(cfg.business_days||'365')}"></div>
          <div class="field"><label>Pays par défaut</label><input name="default_country" value="${esc(cfg.default_country||"Côte d'Ivoire")}"></div>
          <div class="field"><label>E-mail de contact</label><input name="contact_email" type="email" value="${esc(cfg.contact_email||'')}"></div>
          <div class="full"><button class="btn primary">Enregistrer les paramètres</button></div>
        </form></div>
        <div class="panel"><h3>Sécurité Super Admin</h3><p class="muted">Votre compte reste actif sans limite de durée. Les Secrets Cloudflare ne sont jamais affichés ici.</p><form id="passwordForm" class="form-grid"><div class="field full"><label>Mot de passe actuel</label><div class="password-wrap"><input id="oldPassword" name="old_password" type="password" required><button class="password-toggle" type="button" data-toggle-password="oldPassword">◉</button></div></div><div class="field full"><label>Nouveau mot de passe</label><div class="password-wrap"><input id="newPassword" name="new_password" type="password" minlength="8" required><button class="password-toggle" type="button" data-toggle-password="newPassword">◉</button></div></div><div class="full"><button class="btn primary">Changer le mot de passe</button></div></form><div class="permanent-admin-card" style="margin-top:14px"><b>Compte gérant permanent</b><p>Ce compte n’expire jamais et ne peut pas être supprimé par les mécanismes automatiques FREE.</p></div></div>
      </div>`;
    bindPasswordToggles();
    $('#refreshAdminSettings')?.addEventListener('click',()=>renderSettings());
    $('#adminSettingsForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/admin/settings',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});toast('Paramètres enregistrés.')}catch(err){toast(err.message)}};
    $('#passwordForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/change-password',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});toast('Mot de passe modifié. Reconnexion nécessaire.');setTimeout(()=>location.reload(),900)}catch(err){toast(err.message)}};
    return;
  }
  $('#viewContent').innerHTML=`
    <div class="module-hero"><div><span class="section-kicker">SÉCURITÉ</span><h2>Paramètres du compte</h2><p>Gérez votre mot de passe et les options sensibles de votre compte.</p></div></div>
    <div class="panel"><h3>Changer le mot de passe</h3><form id="passwordForm" class="form-grid"><div class="field"><label>Mot de passe actuel</label><div class="password-wrap"><input id="oldPassword" name="old_password" type="password" required><button class="password-toggle" type="button" data-toggle-password="oldPassword">◉</button></div></div><div class="field"><label>Nouveau mot de passe</label><div class="password-wrap"><input id="newPassword" name="new_password" type="password" minlength="8" required><button class="password-toggle" type="button" data-toggle-password="newPassword">◉</button></div></div><div class="full"><button class="btn primary">Mettre à jour le mot de passe</button></div></form></div>
    <div class="panel"><h3>Sessions actives</h3><p class="muted">Fermez toutes les sessions du compte sur les autres appareils. Vous serez également déconnecté de cet appareil.</p><button id="logoutAllSessions" class="btn outline-blue">Déconnecter toutes les sessions</button></div>
    <div class="panel danger-zone"><h3>Demander la suppression de mon compte</h3><p class="muted">Le clic n’efface plus directement votre compte. Il transmet une demande officielle au support GLOBAL EMPLOI. Le Super Admin vérifie la demande et décide de la suppression définitive.</p><button id="deleteMyAccount" class="btn danger">Supprimer définitivement mon compte</button></div>`;
  bindPasswordToggles();
  $('#passwordForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/change-password',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});toast('Mot de passe modifié. Vous devez vous reconnecter.');setTimeout(()=>location.reload(),900)}catch(err){toast(err.message)}};
  $('#logoutAllSessions')?.addEventListener('click',async()=>{if(!confirm('Déconnecter toutes les sessions de ce compte ?'))return;try{await api('/api/account/logout-all',{method:'POST'});location.reload()}catch(err){toast(err.message)}});
  $('#deleteMyAccount').onclick=async()=>{if(!confirm('Envoyer au support GLOBAL EMPLOI une demande de suppression définitive de votre compte ? Votre compte restera actif jusqu’à la décision du Super Admin.'))return;try{await api('/api/account/delete-request',{method:'POST',body:'{}'});toast('Demande de suppression envoyée au support. Votre compte reste actif jusqu’à la décision du Super Admin.')}catch(err){toast(err.message)}};
}
async function renderAdminInbox(){
  if(state.session.user.role!=='super_admin')throw new Error('Accès interdit');
  const raw=await api('/api/admin/inbox');
  const d={registrations:asList(raw.registrations),activation_requests:asList(raw.activation_requests),verification_requests:asList(raw.verification_requests),support_requests:asList(raw.support_requests),recruitment_requests:asList(raw.recruitment_requests),applications:asList(raw.applications)};
  const counts={registrations:d.registrations.length,activations:d.activation_requests.length,verifications:d.verification_requests.length,support:d.support_requests.length,recruitments:d.recruitment_requests.length,applications:d.applications.length};
  $('#viewContent').innerHTML=`
    <div class="module-hero">
      <div><span class="section-kicker">CENTRE DE RÉCEPTION</span><h2>Demandes & inscriptions</h2><p>Toutes les inscriptions et toutes les demandes enregistrées par GLOBAL EMPLOI sont regroupées ici, quel que soit leur statut.</p></div>
      <div class="report-actions"><span class="status-badge active">${formatCount(counts.registrations)} inscription(s)</span><button id="refreshAdminInbox" class="btn outline-blue">Actualiser</button></div>
    </div>
    <div class="inbox-metrics">
      <button class="inbox-metric active" data-inbox="registrations"><strong>${formatCount(counts.registrations)}</strong><span>Inscriptions</span></button>
      <button class="inbox-metric" data-inbox="activations"><strong>${formatCount(counts.activations)}</strong><span>Activations</span></button>
      <button class="inbox-metric" data-inbox="verifications"><strong>${formatCount(counts.verifications)}</strong><span>Vérifications</span></button>
      <button class="inbox-metric" data-inbox="support"><strong>${formatCount(counts.support)}</strong><span>Support</span></button>
      <button class="inbox-metric" data-inbox="recruitments"><strong>${formatCount(counts.recruitments)}</strong><span>Je recrute</span></button>
      <button class="inbox-metric" data-inbox="applications"><strong>${formatCount(counts.applications)}</strong><span>Candidatures</span></button>
    </div>
    <div id="adminInboxContent"></div>`;
  const draw=type=>{
    const box=$('#adminInboxContent');
    if(type==='registrations'){
      box.innerHTML=`<div class="panel"><h3>Toutes les inscriptions</h3><div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Compte</th><th>Rôle</th><th>Statut</th><th>Formule</th><th>Action</th></tr></thead><tbody>${d.registrations.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString('fr-FR')}</td><td><b>${esc(x.email)}</b><br><small>${esc(x.phone||'')}</small></td><td>${x.role==='candidate'?'Demandeur':'Recruteur'}</td><td><span class="pill">${esc(x.status)}</span></td><td>${esc((x.plan||'—').toUpperCase())}</td><td><button class="btn outline-blue inbox-member" data-id="${x.id}">Voir le compte</button></td></tr>`).join('')||'<tr><td colspan="6">Aucune inscription.</td></tr>'}</tbody></table></div></div>`;
      $$('.inbox-member').forEach(b=>b.onclick=()=>adminMemberDetail(Number(b.dataset.id)));
    }else if(type==='activations'){
      box.innerHTML=`<div class="application-cards">${d.activation_requests.map(x=>`<article class="application-card"><div class="card-topline"><b>${esc(x.email)}</b><span class="pill">${esc(x.status)}</span></div><h3>${esc((x.plan||'').toUpperCase())} — ${formatCount(x.amount)} FCFA</h3><p>Téléphone : ${esc(x.payer_phone||'—')}<br>ID transaction : ${esc(x.transaction_id||'—')}</p><small>${new Date(x.created_at).toLocaleString('fr-FR')}</small><div class="application-actions"><button class="btn outline-blue inbox-go-activations">Ouvrir Activations</button></div></article>`).join('')||'<div class="panel empty-state">Aucune demande d’activation.</div>'}</div>`;
      $$('.inbox-go-activations').forEach(b=>b.onclick=()=>navigateView('activations'));
    }else if(type==='verifications'){
      box.innerHTML=`<div class="application-cards">${d.verification_requests.map(x=>`<article class="application-card"><div class="card-topline"><b>${esc(x.company_name||x.email)}</b><span class="pill">${esc(x.verification_status||'unverified')}</span></div><p>${esc(((x.first_name||'')+' '+(x.last_name||'')).trim()||x.email)}</p>${x.verification_note?`<p class="application-message">${esc(x.verification_note)}</p>`:''}<div class="application-actions"><button class="btn outline-blue inbox-member" data-id="${x.user_id}">Voir le compte</button><button class="btn primary inbox-go-verifications">Ouvrir Vérifications</button></div></article>`).join('')||'<div class="panel empty-state">Aucune demande de vérification.</div>'}</div>`;
      $$('.inbox-member').forEach(b=>b.onclick=()=>adminMemberDetail(Number(b.dataset.id)));$$('.inbox-go-verifications').forEach(b=>b.onclick=()=>navigateView('verifications'));
    }else if(type==='support'){
      box.innerHTML=`<div class="application-cards">${d.support_requests.map(x=>`<article class="application-card"><div class="card-topline"><b>${esc(x.subject||'Support')}</b><span class="pill">${esc(x.status)}</span></div><p><b>De :</b> ${esc(x.sender_email||'Système')}</p><p>${esc(x.content)}</p><small>${new Date(x.created_at).toLocaleString('fr-FR')}</small><div class="application-actions"><button class="btn primary inbox-go-messages">Ouvrir Messages</button></div></article>`).join('')||'<div class="panel empty-state">Aucune demande au support.</div>'}</div>`;
      $$('.inbox-go-messages').forEach(b=>b.onclick=()=>navigateView('messages'));
    }else if(type==='recruitments'){
      box.innerHTML=`<div class="panel"><h3>Toutes les propositions « Je recrute »</h3><div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Recruteur</th><th>Candidat</th><th>Statut</th><th>Message</th></tr></thead><tbody>${d.recruitment_requests.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString('fr-FR')}</td><td>${esc(x.company_name||x.recruiter_email)}</td><td>${esc(x.candidate_email)}</td><td><span class="pill">${esc(x.status)}</span></td><td>${esc((x.message||'').slice(0,180))}</td></tr>`).join('')||'<tr><td colspan="5">Aucune proposition.</td></tr>'}</tbody></table></div></div>`;
    }else{
      box.innerHTML=`<div class="panel"><h3>Toutes les candidatures</h3><div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Candidat</th><th>Offre</th><th>Recruteur</th><th>Statut</th></tr></thead><tbody>${d.applications.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString('fr-FR')}</td><td>${esc(x.candidate_email)}</td><td>${esc(x.title)}</td><td>${esc(x.company_name||x.recruiter_email)}</td><td><span class="pill">${esc(x.status)}</span></td></tr>`).join('')||'<tr><td colspan="5">Aucune candidature.</td></tr>'}</tbody></table></div></div>`;
    }
  };
  $$('.inbox-metric').forEach(b=>b.onclick=()=>{$$('.inbox-metric').forEach(x=>x.classList.remove('active'));b.classList.add('active');draw(b.dataset.inbox)});
  $('#refreshAdminInbox').onclick=()=>renderAdminInbox();
  draw('registrations');
}

async function renderAdminMembers(){
  if(state.session.user.role!=='super_admin')throw new Error('Accès interdit');
  const raw=await api('/api/admin/users');
  const d={users:asList(raw.users)};
  $('#viewContent').innerHTML=`
    <div class="module-hero"><div><span class="section-kicker">GESTION CENTRALE</span><h2>Membres inscrits</h2><p>Consultez tous les comptes, leurs statuts et leurs abonnements. Les comptes FREE restent accessibles pour la consultation.</p></div><div class="report-actions"><div class="dashboard-plan light-plan"><small>TOTAL GÉRÉ</small><strong>${formatCount(d.users.filter(x=>x.role!=='super_admin').length)}</strong><span>membres inscrits</span></div><button id="refreshAdminMembers" class="btn outline-blue">Actualiser</button></div></div>
    <div class="market-search admin-filter">
      <div class="field"><label>Recherche</label><input id="adminMemberSearch" placeholder="E-mail, téléphone, rôle…"></div>
      <div class="field"><label>Rôle</label><select id="adminMemberRole"><option value="">Tous</option><option value="candidate">Demandeurs</option><option value="recruiter">Recruteurs</option></select></div>
      <div class="field"><label>Statut</label><select id="adminMemberStatus"><option value="">Tous</option><option value="active">Actifs</option><option value="suspended">Suspendus</option><option value="disabled">Désactivés</option></select></div>
      <button id="adminMemberFilterBtn" class="btn primary">Filtrer</button>
    </div>
    <div id="adminMembersTable"></div>`;
  const draw=()=>{
    const q=$('#adminMemberSearch').value.toLowerCase().trim(),role=$('#adminMemberRole').value,status=$('#adminMemberStatus').value;
    const rows=d.users.filter(x=>x.role!=='super_admin'&&(!role||x.role===role)&&(!status||x.status===status)&&(!q||`${x.email} ${x.phone||''} ${x.role}`.toLowerCase().includes(q)));
    $('#adminMembersTable').innerHTML=`<div class="panel"><div class="table-wrap"><table class="table"><thead><tr><th>Membre</th><th>Rôle</th><th>Statut</th><th>Formule</th><th>Expiration</th><th>Actions</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.email)}</b><br><small>${esc(x.phone||'')}</small></td><td>${x.role==='candidate'?'Demandeur':'Recruteur'}</td><td><span class="pill">${esc(x.status)}</span></td><td>${esc((x.plan||'—').toUpperCase())}</td><td>${x.plan==='free'?'Sans expiration':x.expires_at?new Date(x.expires_at).toLocaleDateString('fr-FR'):'—'}</td><td><div class="admin-row-actions"><button class="btn outline-blue admin-member-detail" data-id="${x.id}">Voir</button><select class="admin-user-status" data-id="${x.id}"><option value="active" ${x.status==='active'?'selected':''}>Actif</option><option value="suspended" ${x.status==='suspended'?'selected':''}>Suspendu</option><option value="disabled" ${x.status==='disabled'?'selected':''}>Désactivé</option></select><button class="btn danger admin-delete-user" data-id="${x.id}" data-email="${esc(x.email)}">Supprimer</button></div></td></tr>`).join('')||'<tr><td colspan="6">Aucun résultat.</td></tr>'}</tbody></table></div></div>`;
    $$('.admin-user-status').forEach(s=>s.onchange=async()=>{try{await api(`/api/admin/users/${s.dataset.id}/status`,{method:'POST',body:JSON.stringify({status:s.value})});toast('Statut du membre mis à jour.')}catch(err){toast(err.message)}});
    $$('.admin-delete-user').forEach(b=>b.onclick=()=>adminDeleteUser(b.dataset.id,b.dataset.email));
    $$('.admin-member-detail').forEach(b=>b.onclick=()=>adminMemberDetail(Number(b.dataset.id)));
  };
  $('#adminMemberFilterBtn').onclick=draw;$('#adminMemberSearch').oninput=draw;$('#adminMemberRole').onchange=draw;$('#adminMemberStatus').onchange=draw;$('#refreshAdminMembers').onclick=()=>renderAdminMembers();draw();
}
async function adminMemberDetail(id){
  try{
    const d=await api(`/api/admin/users/${id}/detail`),u=d.user;
    const display=u.role==='candidate'?`${u.c_first_name||''} ${u.c_last_name||''}`.trim():(u.company_name||`${u.r_first_name||''} ${u.r_last_name||''}`.trim());
    modal(`<div class="admin-member-modal"><span class="section-kicker">${u.role==='candidate'?'DEMANDEUR':'RECRUTEUR'}</span><h2>${esc(display||u.email)}</h2><p class="muted">${esc(u.email)} • ${esc(u.phone||'')}</p>
      <div class="detail-grid"><div><small>Statut</small><strong>${esc(u.status)}</strong></div><div><small>Formule</small><strong>${esc((u.plan||'—').toUpperCase())}</strong></div><div><small>Expiration</small><strong>${u.expires_at?new Date(u.expires_at).toLocaleDateString('fr-FR'):'—'}</strong></div><div><small>Inscription</small><strong>${new Date(u.created_at).toLocaleDateString('fr-FR')}</strong></div><div><small>Dernière connexion</small><strong>${u.last_login_at?new Date(u.last_login_at).toLocaleString('fr-FR'):'—'}</strong></div><div><small>Publications</small><strong>${formatCount(d.publications.jobs||0)} offre(s) • ${formatCount(d.publications.applications||0)} candidature(s)</strong></div></div>
      <div class="admin-member-tools">
        <div class="tool-card"><h3>Changer / prolonger l’abonnement</h3><div class="form-grid"><div class="field"><label>Formule</label><select id="adminMemberPlan"><option value="free">FREE</option><option value="standard">STANDARD</option><option value="business">BUSINESS</option></select></div><div class="field"><label>Durée (jours)</label><input id="adminMemberDays" type="number" min="1" max="730" value="30"></div></div><button id="adminMemberSubscriptionSave" class="btn primary">Appliquer</button></div>
        <div class="tool-card"><h3>Envoyer une notification</h3><input id="adminNotifyTitle" placeholder="Titre"><textarea id="adminNotifyContent" placeholder="Message au membre"></textarea><button id="adminNotifySend" class="btn primary">Envoyer</button></div>
        <div class="tool-card"><h3>Sécurité</h3><p class="muted">Forcer la fermeture des sessions actives de ce membre.</p><button id="adminInvalidateSessions" class="btn outline-blue">Déconnecter toutes ses sessions</button></div>
      </div>
      <div class="detail-section"><h3>Historique des abonnements</h3><div class="table-wrap"><table class="table"><thead><tr><th>Formule</th><th>Début</th><th>Fin</th><th>Statut</th></tr></thead><tbody>${d.subscriptions.map(s=>`<tr><td>${esc(s.plan.toUpperCase())}</td><td>${new Date(s.started_at).toLocaleDateString('fr-FR')}</td><td>${new Date(s.expires_at).toLocaleDateString('fr-FR')}</td><td>${esc(s.status)}</td></tr>`).join('')||'<tr><td colspan="4">Aucun historique.</td></tr>'}</tbody></table></div></div>
    </div>`);
    $('#adminMemberPlan').value=u.plan||'standard';
    $('#adminMemberDays').value=u.plan==='business'?365:u.plan==='free'?7:30;
    $('#adminMemberSubscriptionSave').onclick=async()=>{try{await api(`/api/admin/users/${id}/subscription`,{method:'POST',body:JSON.stringify({plan:$('#adminMemberPlan').value,days:Number($('#adminMemberDays').value)})});toast('Abonnement mis à jour.');closeModal();renderAdminMembers()}catch(err){toast(err.message)}};
    $('#adminNotifySend').onclick=async()=>{try{await api(`/api/admin/users/${id}/notify`,{method:'POST',body:JSON.stringify({title:$('#adminNotifyTitle').value,content:$('#adminNotifyContent').value})});toast('Notification envoyée.')}catch(err){toast(err.message)}};
    $('#adminInvalidateSessions').onclick=async()=>{if(!confirm('Déconnecter toutes les sessions de ce membre ?'))return;try{await api(`/api/admin/users/${id}/invalidate-sessions`,{method:'POST'});toast('Sessions invalidées.')}catch(err){toast(err.message)}};
  }catch(err){toast(err.message)}
}

async function renderAdminActivations(){
  const load=async(status='pending')=>api(`/api/admin/activation-history?status=${encodeURIComponent(status)}`);
  $('#viewContent').innerHTML=`
    <div class="module-hero"><div><span class="section-kicker">ABONNEMENTS</span><h2>Gestion des activations</h2><p>Validez les paiements, consultez les demandes traitées et retrouvez l’historique complet.</p></div><button id="refreshAdminActivations" class="btn outline-blue">Actualiser</button></div>
    <div class="admin-tabs"><button class="admin-tab active" data-status="pending">En attente</button><button class="admin-tab" data-status="approved">Activées</button><button class="admin-tab" data-status="rejected">Rejetées</button><button class="admin-tab" data-status="">Historique complet</button></div>
    <div id="activationList"><div class="page-skeleton compact"><span></span><span></span></div></div>`;
  const draw=async status=>{
    const box=$('#activationList');
    box.innerHTML='<div class="page-skeleton compact"><span></span><span></span></div>';
    try{
      const d=await load(status),requests=asList(d.requests);
      box.innerHTML=`<div class="application-cards">${requests.map(x=>`<article class="application-card">
        <div class="card-topline"><b>${esc(x.email)}</b><span class="pill">${esc(x.status)}</span></div>
        <h3>${esc(x.plan.toUpperCase())} — ${formatCount(x.amount)} FCFA</h3>
        <div class="application-info"><span><small>Rôle</small>${esc(x.role)}</span><span><small>Téléphone paiement</small>${esc(x.payer_phone)}</span><span><small>ID transaction</small>${esc(x.transaction_id)}</span><span><small>Date</small>${new Date(x.created_at).toLocaleString('fr-FR')}</span></div>
        ${x.admin_note?`<p class="application-message">${esc(x.admin_note)}</p>`:''}
        ${x.status==='pending'?`<div class="application-actions"><button class="btn primary approve" data-id="${x.id}">Activer</button><button class="btn danger reject" data-id="${x.id}">Paiement non trouvé</button></div>`:`<small>Traité ${x.processed_at?'le '+new Date(x.processed_at).toLocaleString('fr-FR'):''}${x.admin_email?' par '+esc(x.admin_email):''}</small>`}
      </article>`).join('')||'<div class="panel empty-state">Aucune demande dans cette catégorie.</div>'}</div>`;
      $$('.approve').forEach(b=>b.onclick=async()=>{await adminAction(b.dataset.id,'approve');await draw(status)});
      $$('.reject').forEach(b=>b.onclick=async()=>{await adminAction(b.dataset.id,'reject');await draw(status)});
    }catch(err){box.innerHTML=directoryError('Impossible de charger les activations.',err);bindDirectoryRetry(box,()=>draw(status))}
  };
  $$('.admin-tab').forEach(b=>b.onclick=()=>{$$('.admin-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');draw(b.dataset.status)});
  $('#refreshAdminActivations').onclick=()=>renderAdminActivations();
  await draw('pending');
}

async function renderAdminVerifications(){
  const raw=await api('/api/admin/recruiter-verifications/all');
  const d={recruiters:asList(raw.recruiters)};
  $('#viewContent').innerHTML=`
    <div class="module-hero"><div><span class="section-kicker">CONTRÔLE ENTREPRISE</span><h2>Vérifications recruteurs</h2><p>Examinez les dossiers, validez les entreprises ou demandez des compléments.</p></div><button id="refreshAdminVerifications" class="btn outline-blue">Actualiser</button></div>
    <div class="market-search admin-filter"><div class="field"><label>Recherche</label><input id="verifySearch" placeholder="Entreprise, responsable, e-mail…"></div><div class="field"><label>Statut</label><select id="verifyStatus"><option value="">Tous</option><option value="pending">En cours</option><option value="verified">Vérifiés</option><option value="unverified">Non vérifiés</option><option value="rejected">À compléter</option></select></div><button id="verifyFilter" class="btn primary">Filtrer</button></div>
    <div id="verifyList"></div>`;
  const draw=()=>{
    const q=$('#verifySearch').value.toLowerCase().trim(),st=$('#verifyStatus').value;
    const rows=d.recruiters.filter(x=>(!st||x.verification_status===st)&&(!q||`${x.company_name||''} ${x.first_name||''} ${x.last_name||''} ${x.email||''}`.toLowerCase().includes(q)));
    $('#verifyList').innerHTML=`<div class="application-cards">${rows.map(x=>`<article class="application-card"><div class="card-topline"><span class="pill">${esc(x.verification_status||'unverified')}</span><small>${x.updated_at?new Date(x.updated_at).toLocaleString('fr-FR'):''}</small></div><h3>${esc(x.company_name||'Entreprise non renseignée')}</h3><p><b>${esc(((x.first_name||'')+' '+(x.last_name||'')).trim())}</b> • ${esc(x.job_title||x.email)}</p><div class="application-info"><span><small>Type</small>${esc(x.organization_type||'—')}</span><span><small>Secteur</small>${esc(x.sector||'—')}</span><span><small>Ville</small>${esc(x.company_city||'—')}</span><span><small>Téléphone</small>${esc(x.phone||'—')}</span></div>${x.verification_note?`<p class="application-message">${esc(x.verification_note)}</p>`:''}<div class="application-actions">${x.verification_status!=='verified'?`<button class="btn primary recruiter-verify" data-id="${x.user_id}">Entreprise vérifiée ✓</button>`:''}<button class="btn danger recruiter-reject" data-id="${x.user_id}">Informations à compléter</button><button class="btn outline-blue admin-member-detail" data-id="${x.user_id}">Voir le compte</button></div></article>`).join('')||'<div class="panel empty-state">Aucun dossier.</div>'}</div>`;
    $$('.recruiter-verify').forEach(b=>b.onclick=async()=>{await recruiterVerificationAction(b.dataset.id,'verify');renderAdminVerifications()});
    $$('.recruiter-reject').forEach(b=>b.onclick=async()=>{await recruiterVerificationAction(b.dataset.id,'reject');renderAdminVerifications()});
    $$('.admin-member-detail').forEach(b=>b.onclick=()=>adminMemberDetail(Number(b.dataset.id)));
  };
  $('#verifyFilter').onclick=draw;$('#verifySearch').oninput=draw;$('#verifyStatus').onchange=draw;$('#refreshAdminVerifications').onclick=()=>renderAdminVerifications();draw();
}

async function renderAdminJobs(){
  const raw=await api('/api/admin/jobs');
  const d={jobs:asList(raw.jobs)};
  $('#viewContent').innerHTML=`
    <div class="module-hero"><div><span class="section-kicker">MODÉRATION</span><h2>Toutes les offres</h2><p>Supervisez toutes les publications, y compris celles appartenant à des comptes expirés ou désactivés.</p></div><div class="report-actions"><span class="status-badge">${formatCount(d.jobs.length)} offres</span><button id="refreshAdminJobs" class="btn outline-blue">Actualiser</button></div></div>
    <div class="market-search admin-filter"><div class="field"><label>Recherche</label><input id="adminJobSearch" placeholder="Titre, entreprise, ville…"></div><div class="field"><label>Statut</label><select id="adminJobStatus"><option value="">Tous</option><option value="published">Publiées</option><option value="draft">Brouillons</option><option value="suspended">Suspendues</option><option value="closed">Clôturées</option></select></div><button id="adminJobFilter" class="btn primary">Filtrer</button></div>
    <div id="adminJobsList"></div>`;
  const draw=()=>{
    const q=$('#adminJobSearch').value.toLowerCase().trim(),st=$('#adminJobStatus').value;
    const rows=d.jobs.filter(j=>(!st||j.status===st)&&(!q||`${j.title} ${j.company_name||j.recruiter_email} ${j.location||''}`.toLowerCase().includes(q)));
    $('#adminJobsList').innerHTML=`<div class="professional-list">${rows.map(j=>`<article class="manage-card"><div><div class="card-topline"><span class="pill">${esc(j.status)}</span><small>${new Date(j.created_at).toLocaleDateString('fr-FR')}</small></div><h3>${esc(j.title)}</h3><p><b>${esc(j.company_name||j.recruiter_email)}</b> • ${esc(j.location||'')}</p><p class="muted">${formatCount(j.application_count)} candidature(s)</p></div><div class="manage-actions"><button class="btn outline-blue admin-job-detail" data-id="${j.id}">Voir</button><select class="admin-job-status" data-id="${j.id}"><option value="published" ${j.status==='published'?'selected':''}>Publiée</option><option value="draft" ${j.status==='draft'?'selected':''}>Brouillon</option><option value="suspended" ${j.status==='suspended'?'selected':''}>Suspendue</option><option value="closed" ${j.status==='closed'?'selected':''}>Clôturée</option></select><button class="btn danger admin-job-delete" data-id="${j.id}">Supprimer</button></div></article>`).join('')||'<div class="panel empty-state">Aucune offre.</div>'}</div>`;
    const byId=new Map(rows.map(j=>[String(j.id),j]));
    $$('.admin-job-detail').forEach(b=>b.onclick=()=>{const j=byId.get(b.dataset.id);modal(`<h2>${esc(j.title)}</h2><p><b>${esc(j.company_name||j.recruiter_email)}</b> • ${esc(j.location||'')}</p><div class="detail-grid"><div><small>Statut</small><strong>${esc(j.status)}</strong></div><div><small>Contrat</small><strong>${esc(j.employment_type||'—')}</strong></div><div><small>Profession</small><strong>${esc(j.profession||'—')}</strong></div><div><small>Catégorie</small><strong>${esc(j.category||'—')}</strong></div><div><small>Rémunération</small><strong>${esc(j.salary||'—')}</strong></div><div><small>Candidatures</small><strong>${formatCount(j.application_count)}</strong></div></div><div class="detail-section"><h3>Description</h3><p>${esc(j.description||'')}</p></div><div class="detail-actions"><button class="btn outline-blue view-recruiter" data-id="${j.recruiter_id}">Voir le recruteur</button></div>`);$('.view-recruiter').onclick=()=>{closeModal();adminMemberDetail(Number(j.recruiter_id))}});
    $$('.admin-job-status').forEach(s=>s.onchange=async()=>{try{await api(`/api/admin/jobs/${s.dataset.id}/status`,{method:'POST',body:JSON.stringify({status:s.value})});toast('Statut de l’offre mis à jour.')}catch(err){toast(err.message)}});
    $$('.admin-job-delete').forEach(b=>b.onclick=async()=>{if(!confirm('Supprimer définitivement cette offre ?'))return;try{await api(`/api/admin/jobs/${b.dataset.id}`,{method:'DELETE'});toast('Offre supprimée.');renderAdminJobs()}catch(err){toast(err.message)}});
  };
  $('#adminJobFilter').onclick=draw;$('#adminJobSearch').oninput=draw;$('#adminJobStatus').onchange=draw;$('#refreshAdminJobs').onclick=()=>renderAdminJobs();draw();
}

async function renderAdminApplications(){
  const raw=await api('/api/admin/applications');
  const d={applications:asList(raw.applications)};
  $('#viewContent').innerHTML=`
    <div class="module-hero"><div><span class="section-kicker">SUIVI GLOBAL</span><h2>Candidatures de la plateforme</h2><p>Supervisez toutes les candidatures enregistrées dans D1.</p></div><div class="report-actions"><span class="status-badge">${formatCount(d.applications.length)} candidatures</span><button id="refreshAdminApplications" class="btn outline-blue">Actualiser</button></div></div>
    <div class="market-search admin-filter"><div class="field"><label>Recherche</label><input id="adminAppSearch" placeholder="Candidat, offre, entreprise…"></div><div class="field"><label>Statut</label><select id="adminAppStatus"><option value="">Tous</option><option value="submitted">Nouvelles</option><option value="reviewing">À l’étude</option><option value="accepted">Acceptées</option><option value="rejected">Refusées</option></select></div><button id="adminAppFilter" class="btn primary">Filtrer</button></div>
    <div id="adminAppsTable"></div>`;
  const draw=()=>{
    const q=$('#adminAppSearch').value.toLowerCase().trim(),st=$('#adminAppStatus').value;
    const rows=d.applications.filter(a=>(!st||a.status===st)&&(!q||`${a.candidate_email} ${a.title} ${a.company_name||a.recruiter_email}`.toLowerCase().includes(q)));
    $('#adminAppsTable').innerHTML=`<div class="panel"><div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Candidat</th><th>Offre</th><th>Recruteur</th><th>Statut</th></tr></thead><tbody>${rows.map(a=>`<tr><td>${new Date(a.created_at).toLocaleDateString('fr-FR')}</td><td>${esc(a.candidate_email)}</td><td>${esc(a.title)}</td><td>${esc(a.company_name||a.recruiter_email)}</td><td><span class="pill">${esc(a.status)}</span></td></tr>`).join('')||'<tr><td colspan="5">Aucune candidature.</td></tr>'}</tbody></table></div></div>`;
  };
  $('#adminAppFilter').onclick=draw;$('#adminAppSearch').oninput=draw;$('#adminAppStatus').onchange=draw;$('#refreshAdminApplications').onclick=()=>renderAdminApplications();draw();
}

async function renderAdminReports(){
  $('#viewContent').innerHTML=`
    <div class="module-hero"><div><span class="section-kicker">RAPPORTS</span><h2>Rapports & statistiques</h2><p>Analysez l’activité réelle de GLOBAL EMPLOI selon la période sélectionnée.</p></div><div class="report-actions"><button id="adminReportPrint" class="btn outline-blue">Imprimer</button><button id="adminReportCsv" class="btn primary">Exporter CSV</button></div></div>
    <div class="market-search report-filter"><div class="field"><label>Période</label><select id="adminReportDays"><option value="1">Aujourd’hui</option><option value="7">7 jours</option><option value="30" selected>30 jours</option><option value="90">90 jours</option><option value="365">1 an</option></select></div><button id="adminReportLoad" class="btn primary">Actualiser</button></div>
    <div id="adminReportContent"><div class="page-skeleton compact"><span></span><span></span></div></div>`;
  let current=null;
  const draw=async()=>{
    const box=$('#adminReportContent');
    box.innerHTML='<div class="page-skeleton compact"><span></span><span></span></div>';
    try{
      current=await api(`/api/admin/report?days=${encodeURIComponent($('#adminReportDays').value)}`);
      box.innerHTML=`
        <div class="dashboard-metrics admin-metrics">
          <div class="dash-metric"><span>♙</span><div><small>Nouveaux membres</small><strong>${formatCount(current.new_users)}</strong></div></div>
          <div class="dash-metric"><span>♧</span><div><small>Nouveaux demandeurs</small><strong>${formatCount(current.new_candidates)}</strong></div></div>
          <div class="dash-metric"><span>▦</span><div><small>Nouveaux recruteurs</small><strong>${formatCount(current.new_recruiters)}</strong></div></div>
          <div class="dash-metric"><span>▣</span><div><small>Nouvelles offres</small><strong>${formatCount(current.new_jobs)}</strong></div></div>
          <div class="dash-metric"><span>✓</span><div><small>Candidatures</small><strong>${formatCount(current.new_applications)}</strong></div></div>
          <div class="dash-metric"><span>◈</span><div><small>Recettes théoriques</small><strong>${formatCount(current.theoretical_revenue)} F</strong></div></div>
        </div>
        <div class="dashboard-columns" style="margin-top:18px">
          <div class="dashboard-card"><h3>Abonnements enregistrés sur la période</h3><div class="admin-split"><div><strong>${formatCount(current.standard)}</strong><span>STANDARD</span></div><div><strong>${formatCount(current.business)}</strong><span>BUSINESS</span></div><div><strong>${formatCount(current.expired_paid)}</strong><span>Payants expirés</span></div></div></div>
          <div class="dashboard-card"><h3>Traitement administratif</h3><p><b>${formatCount(current.pending_activations)}</b> activation(s) encore en attente.</p><p class="muted">La valeur financière est indicative et calculée à partir des activations enregistrées dans GLOBAL EMPLOI.</p></div>
        </div>`;
    }catch(err){current=null;box.innerHTML=directoryError('Impossible de charger le rapport.',err);bindDirectoryRetry(box,draw)}
  };
  $('#adminReportLoad').onclick=draw;
  $('#adminReportPrint').onclick=()=>window.print();
  $('#adminReportCsv').onclick=()=>{if(!current)return;const rows=[['Indicateur','Valeur'],['Période (jours)',current.days],['Nouveaux membres',current.new_users],['Nouveaux demandeurs',current.new_candidates],['Nouveaux recruteurs',current.new_recruiters],['Nouvelles offres',current.new_jobs],['Candidatures',current.new_applications],['STANDARD',current.standard],['BUSINESS',current.business],['Payants expirés',current.expired_paid],['Activations en attente',current.pending_activations],['Recettes théoriques FCFA',current.theoretical_revenue]];downloadCsv('global-emploi-rapport.csv',rows)};
  await draw();
}
function downloadCsv(filename,rows){
  const content=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(';')).join('\n');
  const blob=new Blob(['\uFEFF'+content],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();URL.revokeObjectURL(a.href);a.remove();
}

async function renderAdminLogs(){
  const raw=await api('/api/admin/audit-logs');
  const d={logs:asList(raw.logs)};
  $('#viewContent').innerHTML=`
    <div class="module-hero"><div><span class="section-kicker">SÉCURITÉ</span><h2>Journal d’activité</h2><p>Historique en lecture seule des opérations sensibles réalisées sur la plateforme.</p></div><div class="report-actions"><span class="status-badge">${formatCount(d.logs.length)} événement(s)</span><button id="refreshAdminLogs" class="btn outline-blue">Actualiser</button></div></div>
    <div class="market-search admin-filter"><div class="field"><label>Recherche</label><input id="auditSearch" placeholder="Action, utilisateur, cible…"></div><div class="field"><label>Type d’action</label><select id="auditAction"><option value="">Toutes</option><option value="LOGIN">Connexions</option><option value="SUBSCRIPTION">Abonnements</option><option value="USER">Membres</option><option value="JOB">Offres</option><option value="PASSWORD">Mots de passe</option></select></div><button id="auditFilter" class="btn primary">Filtrer</button></div>
    <div id="auditTable"></div>`;
  const draw=()=>{
    const q=$('#auditSearch').value.toLowerCase().trim(),type=$('#auditAction').value;
    const rows=d.logs.filter(x=>(!type||String(x.action).includes(type))&&(!q||`${x.actor_email||''} ${x.action||''} ${x.target_type||''} ${x.target_id||''}`.toLowerCase().includes(q)));
    $('#auditTable').innerHTML=`<div class="panel"><div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Acteur</th><th>Action</th><th>Cible</th><th>Détails</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString('fr-FR')}</td><td>${esc(x.actor_email||'Système')}</td><td><b>${esc(x.action)}</b></td><td>${esc(x.target_type||'—')} ${x.target_id?'#'+esc(x.target_id):''}</td><td><small>${esc((x.metadata||'').slice(0,220))}</small></td></tr>`).join('')||'<tr><td colspan="5">Aucune activité.</td></tr>'}</tbody></table></div></div>`;
  };
  $('#auditFilter').onclick=draw;$('#auditSearch').oninput=draw;$('#auditAction').onchange=draw;$('#refreshAdminLogs').onclick=()=>renderAdminLogs();draw();
}

async function renderAdmin(){
  if(state.session.user.role!=='super_admin')throw new Error('Accès interdit');
  const [r,u,v]=await Promise.all([api('/api/admin/subscription-requests'),api('/api/admin/users'),api('/api/admin/recruiter-verifications')]);
  $('#viewContent').innerHTML=`
  <div class="grid">
    <div class="card metric"><span>Utilisateurs</span><strong>${u.users.length}</strong></div>
    <div class="card metric"><span>Activations en attente</span><strong>${r.requests.length}</strong></div>
    <div class="card metric"><span>Recruteurs à vérifier</span><strong>${v.recruiters.length}</strong></div>
  </div>
  <div class="panel" style="margin-top:18px"><h3>Vérification des recruteurs</h3>
    <div class="table-wrap"><table class="table"><thead><tr><th>Recruteur</th><th>Entreprise</th><th>Secteur</th><th>Actions</th></tr></thead><tbody>
    ${v.recruiters.map(x=>`<tr><td>${esc(((x.first_name||'')+' '+(x.last_name||'')).trim())}<br><small>${esc(x.job_title||x.email)}</small></td><td>${esc(x.company_name||'—')}<br><small>${esc(x.organization_type||'')}</small></td><td>${esc(x.sector||'—')}<br><small>${esc(x.company_city||'')}</small></td><td><button class="btn primary recruiter-verify" data-id="${x.user_id}">Vérifier ✓</button> <button class="btn danger recruiter-reject" data-id="${x.user_id}">À compléter</button></td></tr>`).join('')||'<tr><td colspan="4">Aucune demande de vérification en attente.</td></tr>'}
    </tbody></table></div>
  </div>
  <div class="panel"><h3>Demandes d'activation</h3><div class="table-wrap"><table class="table"><thead><tr><th>Client</th><th>Formule</th><th>Montant</th><th>Paiement</th><th>Actions</th></tr></thead><tbody>${r.requests.map(x=>`<tr><td>${esc(x.email)}<br><small>${esc(x.role)}</small></td><td>${esc(x.plan)}</td><td>${x.amount} F</td><td>${esc(x.payer_phone)}<br><small>${esc(x.transaction_id)}</small></td><td><button class="btn primary approve" data-id="${x.id}">Activer</button> <button class="btn danger reject" data-id="${x.id}">Paiement non trouvé</button></td></tr>`).join('')||'<tr><td colspan="5">Aucune demande en attente.</td></tr>'}</tbody></table></div></div>
  <div class="panel"><h3>Utilisateurs</h3><div class="table-wrap"><table class="table"><thead><tr><th>E-mail</th><th>Rôle</th><th>Statut</th><th>Formule</th><th>Expiration</th><th>Action</th></tr></thead><tbody>${u.users.map(x=>`<tr><td>${esc(x.email)}</td><td>${esc(x.role)}</td><td>${esc(x.status)}</td><td>${esc(x.plan||'—')}</td><td>${x.expires_at?new Date(x.expires_at).toLocaleDateString('fr-FR'):'—'}</td><td>${x.role==='super_admin'?'—':`<button class="btn danger admin-delete-user" data-id="${x.id}" data-email="${esc(x.email)}">Supprimer</button>`}</td></tr>`).join('')}</tbody></table></div></div>`;
  $$('.approve').forEach(b=>b.onclick=()=>adminAction(b.dataset.id,'approve'));
  $$('.reject').forEach(b=>b.onclick=()=>adminAction(b.dataset.id,'reject'));
  $$('.recruiter-verify').forEach(b=>b.onclick=()=>recruiterVerificationAction(b.dataset.id,'verify'));
  $$('.recruiter-reject').forEach(b=>b.onclick=()=>recruiterVerificationAction(b.dataset.id,'reject'));$$('.admin-delete-user').forEach(b=>b.onclick=()=>adminDeleteUser(b.dataset.id,b.dataset.email));
}
async function recruiterVerificationAction(id,action){
  try{await api(`/api/admin/recruiters/${id}/${action}`,{method:'POST',body:JSON.stringify({note:action==='reject'?'Veuillez compléter ou corriger les informations de vérification.':''})});toast(action==='verify'?'Entreprise vérifiée avec succès.':'Demande renvoyée au recruteur.')}catch(err){toast(err.message)}
}

async function adminDeleteUser(id,email){
  if(!confirm(`Supprimer définitivement le compte ${email} et toutes ses publications liées ?`))return;
  try{await api(`/api/admin/users/${id}`,{method:'DELETE'});toast('Compte et publications supprimés.');renderAdminMembers()}catch(err){toast(err.message)}
}

async function adminAction(id,action){try{await api(`/api/admin/subscription-requests/${id}/${action}`,{method:'POST',body:'{}'});toast(action==='approve'?'Abonnement activé':'Demande rejetée')}catch(err){toast(err.message);throw err}}

function scheduleFreePopup(){
  clearInterval(state.freeTimer);
  state.freeTimer=null;
}

const mobileMenuBtn=$('#mobileMenuBtn');
if(mobileMenuBtn){mobileMenuBtn.onclick=()=>{const nav=$('#publicNav');const open=nav.classList.toggle('open');mobileMenuBtn.setAttribute('aria-expanded',String(open));};$$('#publicNav a').forEach(a=>a.addEventListener('click',()=>{$('#publicNav').classList.remove('open');mobileMenuBtn.setAttribute('aria-expanded','false')}));}
// V35 : la recherche rapide du Hero a été retirée du design.
// Les recherches détaillées restent disponibles dans les pages publiques Offres et Profils.

const PUBLIC_HASH_PAGES=new Set(['jobs','candidates','plans']);
function applyPublicHashRoute(){
  const page=String(location.hash||'').replace(/^#/,'').trim();
  if(PUBLIC_HASH_PAGES.has(page)) openPublicPage(page);
}
window.addEventListener('hashchange',()=>{
  const page=String(location.hash||'').replace(/^#/,'').trim();
  if(PUBLIC_HASH_PAGES.has(page)) openPublicPage(page);
  else if(page==='home'||!page) showPublicHome('home');
});
boot();

function openPublicPage(page){
  const sections=[...document.querySelectorAll('#guestHome > section')];
  const target=document.getElementById(page);
  if(!target)return;
  $('#guestHome')?.classList.remove('hidden');
  $('#guestHome')?.classList.remove('home-overview');
  $('#app')?.classList.add('hidden');
  sections.forEach(s=>s.classList.toggle('public-page-hidden',s.id!==page));
  document.querySelectorAll('#publicNav a').forEach(a=>{
    const p=a.dataset.publicPage||(a.getAttribute('href')==='#home'?'home':'');
    a.classList.toggle('active',p===page);
  });
  buildConnectedTopNav();
  closeAccountMenu();
  history.replaceState(null,'',`#${page}`);
  window.scrollTo({top:0,behavior:'smooth'});
  if(page==='jobs')loadPublicJobs(1);
  if(page==='candidates')loadPublicCandidates(1);
}
document.querySelectorAll('[data-public-page]').forEach(a=>a.addEventListener('click',e=>{
  e.preventDefault(); openPublicPage(a.dataset.publicPage);
}));
document.querySelector('#publicNav a[href="#home"]')?.addEventListener('click',e=>{
  e.preventDefault();
  document.querySelectorAll('#guestHome > section').forEach(s=>s.classList.remove('public-page-hidden'));
  if(state.session) showPublicHome('home');
  else {$('#guestHome').classList.remove('hidden');$('#guestHome').classList.add('home-overview');$('#app').classList.add('hidden');syncViewNavigation('home');}
  buildConnectedTopNav();
  $('#publicNav')?.classList.remove('open');
  $('#mobileMenuBtn')?.setAttribute('aria-expanded','false');
  history.replaceState(null,'','#home');
  window.scrollTo({top:0,behavior:'smooth'});
});
document.getElementById('contactLoginBtn')?.addEventListener('click',loginModal);
bindPasswordToggles();bindHomePrimaryActions();

function directoryError(title,err){
  const ref=err?.reference?`<div class="error-reference">Référence : <code>${esc(err.reference)}</code></div>`:'';
  return `<div class="panel error-panel professional-error"><div><h3>${esc(title)}</h3><p>${esc(err?.message||'Erreur inconnue')}</p>${ref}<div class="error-actions"><button class="btn primary directory-retry" type="button">Réessayer</button><button class="btn outline-blue directory-home" type="button">Retour à l’accueil</button></div></div></div>`;
}
function bindDirectoryRetry(root,retry){
  root?.querySelector('.directory-retry')?.addEventListener('click',retry);
  root?.querySelector('.directory-home')?.addEventListener('click',()=>showPublicHome('home'));
}
function roleNow(){return state.session?.user?.role||null}
function requirePaidCandidateAction(callback){
  if(!state.session){registerModal('candidate');return false}
  if(state.session.user.role==='super_admin'){return false}
  if(state.session.user.role!=='candidate'){toast('Cette action est réservée aux demandeurs d’emploi.');return false}
  if(!hasActivePaidPlan()){navigateView('subscription');toast('Activez STANDARD ou BUSINESS pour postuler.');return false}
  callback?.();return true;
}
function requirePaidRecruiterAction(callback){
  if(!state.session){registerModal('recruiter');return false}
  if(state.session.user.role==='super_admin'){return false}
  if(state.session.user.role!=='recruiter'){toast('Cette action est réservée aux recruteurs.');return false}
  if(!hasActivePaidPlan()){navigateView('subscription');toast('Activez STANDARD ou BUSINESS pour recruter.');return false}
  callback?.();return true;
}

function hasActivePaidPlan(){
  const s=state.session?.subscription;
  return !!(s && s.effective_status==='active' && (s.plan==='standard'||s.plan==='business') && (!s.expires_at || new Date(s.expires_at).getTime()>Date.now()));
}
function formatDateFR(v){if(!v)return '—';try{return new Date(v).toLocaleDateString('fr-FR')}catch{return String(v)}}
function publicActionForJob(jobId){
  const role=roleNow();
  if(!role) return `<button class="btn primary public-register-candidate" data-job="${jobId}">Je postule</button>`;
  if(role==='candidate'){
    if(hasActivePaidPlan()) return `<button class="btn primary public-apply" data-job="${jobId}">Je postule</button>`;
    return `<button class="btn primary public-subscribe-candidate" data-job="${jobId}">Je postule</button>`;
  }
  if(role==='super_admin') return `<span class="role-note">Consultation Super Admin</span>`;
  return `<span class="role-note">La candidature est réservée aux demandeurs d’emploi.</span>`;
}
function publicActionForCandidate(candidateId){
  const role=roleNow();
  if(!role) return `<button class="btn primary public-register-recruiter" data-candidate="${candidateId}">Je recrute</button>`;
  if(role==='recruiter'){
    if(hasActivePaidPlan()) return `<button class="btn primary public-recruit" data-candidate="${candidateId}">Je recrute</button>`;
    return `<button class="btn primary public-subscribe-recruiter" data-candidate="${candidateId}">Je recrute</button>`;
  }
  if(role==='super_admin') return `<span class="role-note">Consultation Super Admin</span>`;
  return `<span class="role-note">Action réservée aux recruteurs.</span>`;
}
async function loadPublicJobs(page=1){
  const grid=$('#publicJobsGrid');if(!grid)return;
  const q=$('#jobsSearchQ')?.value?.trim()||'',city=$('#jobsSearchCity')?.value?.trim()||'';
  const contract=$('#jobsSearchContract')?.value||'',category=$('#jobsSearchCategory')?.value?.trim()||'',days=$('#jobsSearchDays')?.value||'0';
  grid.innerHTML='<div class="directory-skeleton"><span></span><span></span><span></span></div>';
  $('#publicJobsPagination').innerHTML='';
  try{
    const qs=new URLSearchParams({q,city,contract,category,days,page:String(page),per_page:'12'});
    const d=await api(`/api/jobs?${qs}`);
    const pg=d.pagination||{page:1,pages:1,total:d.jobs.length};
    $('#publicJobsCount').textContent=`${formatCount(pg.total)} offre${pg.total>1?'s':''} disponible${pg.total>1?'s':''} • Page ${pg.page}/${pg.pages}`;
    grid.innerHTML=d.jobs.length?d.jobs.map(j=>`
      <article class="offer-card job-market-card clickable-card" data-job="${j.id}" tabindex="0">
        <div class="offer-top"><div class="company-logo">${j.logo?`<img src="${esc(j.logo)}" alt="">`:esc((j.company_name||'GE').slice(0,2).toUpperCase())}</div><span class="offer-badge new">${esc((j.plan||'standard').toUpperCase())}</span></div>
        <h3>${esc(j.title)}</h3><p class="company">${esc(j.company_name||'Recruteur GLOBAL EMPLOI')}</p>
        <div class="offer-meta"><span>⌖ ${esc(j.location||'Lieu non précisé')}</span><span>▣ ${esc(j.employment_type||'Type non précisé')}</span></div>
        <p class="card-summary">${esc((j.description||'').slice(0,160))}${(j.description||'').length>160?'…':''}</p>
        <div class="offer-footer"><small>Publié le ${formatDateFR(j.created_at)}</small><span>${esc(j.category||j.profession||'')}</span></div>
        <div class="card-actions"><button class="btn outline-blue public-job-detail" data-job="${j.id}">Voir l’offre</button>${publicActionForJob(j.id)}</div>
      </article>`).join(''):'<div class="panel empty-state">Aucune offre disponible ne correspond à votre recherche.</div>';
    renderDirectoryPagination('#publicJobsPagination',pg,p=>loadPublicJobs(p));
    $$('.job-market-card').forEach(card=>{
      card.addEventListener('click',e=>{if(e.target.closest('button'))return;openJobDetail(Number(card.dataset.job))});
      card.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('button')){e.preventDefault();openJobDetail(Number(card.dataset.job))}}
    });
    $$('.public-job-detail').forEach(b=>b.onclick=e=>{e.stopPropagation();openJobDetail(Number(b.dataset.job))});
    $$('.public-apply').forEach(b=>b.onclick=e=>{e.stopPropagation();requirePaidCandidateAction(()=>applyFromPublic(Number(b.dataset.job)))});
    $$('.public-subscribe-candidate').forEach(b=>b.onclick=e=>{e.stopPropagation();navigateView('subscription')});
    $$('.public-register-candidate').forEach(b=>b.onclick=e=>{e.stopPropagation();registerModal('candidate')});
  }catch(err){
    $('#publicJobsCount').textContent='';
    grid.innerHTML=directoryError('Impossible d’afficher les offres.',err);
    bindDirectoryRetry(grid,()=>loadPublicJobs(page));
  }
}
async function openJobDetail(id){
  try{
    const d=await api(`/api/jobs/${id}`),j=d.job;
    modal(`<div class="detail-popup">
      <div class="detail-head"><div><span class="pill">${esc(j.employment_type||'Offre')}</span><h2>${esc(j.title)}</h2><p class="muted">${esc(j.company_name||'Recruteur')} • ${esc(j.location||'Lieu non précisé')}</p></div></div>
      <div class="detail-grid">
        <div><small>Profession</small><strong>${esc(j.profession||'—')}</strong></div>
        <div><small>Catégorie</small><strong>${esc(j.category||'—')}</strong></div>
        <div><small>Rémunération</small><strong>${esc(j.salary||'Non précisée')}</strong></div>
        <div><small>Postes disponibles</small><strong>${esc(j.vacancies||1)}</strong></div>
        <div><small>Date de début</small><strong>${formatDateFR(j.starts_at)}</strong></div>
        <div><small>Date limite</small><strong>${formatDateFR(j.closes_at)}</strong></div>
      </div>
      <div class="detail-section"><h3>Description complète</h3><p>${esc(j.description||'')}</p></div>
      ${j.company_description?`<div class="detail-section"><h3>À propos de l’entreprise</h3><p>${esc(j.company_description)}</p></div>`:''}
      <div class="detail-actions">${publicActionForJob(j.id)}</div>
    </div>`);
    $('.public-apply')?.addEventListener('click',()=>requirePaidCandidateAction(()=>applyFromPublic(id)));
    $('.public-subscribe-candidate')?.addEventListener('click',()=>{closeModal();navigateView('subscription')});
    $('.public-register-candidate')?.addEventListener('click',()=>{closeModal();registerModal('candidate')});
  }catch(err){toast(err.message)}
}
async function applyFromPublic(id){
  try{
    await api(`/api/jobs/${id}/apply`,{method:'POST',body:JSON.stringify({})});
    closeModal();toast('Votre candidature a été envoyée au recruteur.');
  }catch(err){
    if(err.code==='HTTP_403'&&state.session?.user?.role==='candidate'){closeModal();navigateView('subscription')}
    toast(err.message);
  }
}
async function loadPublicCandidates(page=1){
  const grid=$('#publicCandidatesGrid');if(!grid)return;
  const q=$('#candidatesSearchQ')?.value?.trim()||'',city=$('#candidatesSearchCity')?.value?.trim()||'';
  const experience=$('#candidatesSearchExperience')?.value?.trim()||'',education=$('#candidatesSearchEducation')?.value?.trim()||'',availability=$('#candidatesSearchAvailability')?.value?.trim()||'';
  grid.innerHTML='<div class="directory-skeleton"><span></span><span></span><span></span></div>';
  $('#publicCandidatesPagination').innerHTML='';
  try{
    const qs=new URLSearchParams({q,city,experience,education,availability,page:String(page),per_page:'12'});
    const d=await api(`/api/candidates?${qs}`);
    const pg=d.pagination||{page:1,pages:1,total:d.candidates.length};
    $('#publicCandidatesCount').textContent=`${formatCount(pg.total)} talent${pg.total>1?'s':''} disponible${pg.total>1?'s':''} • Page ${pg.page}/${pg.pages}`;
    grid.innerHTML=d.candidates.length?d.candidates.map(c=>`
      <article class="candidate-market-card clickable-card" data-candidate="${c.id}" tabindex="0">
        <div class="candidate-photo">${c.photo?`<img src="${esc(c.photo)}" alt="">`:`<span>${esc(((c.first_name||'P')[0]||'P')+((c.last_name||'')[0]||''))}</span>`}</div>
        <div class="candidate-body"><span class="pill">${esc((c.plan||'standard').toUpperCase())}</span>
          <h3>${esc(`${c.first_name||''} ${c.last_name||''}`.trim()||'Professionnel')}</h3>
          <strong>${esc(c.professional_title||c.profession||'Profil professionnel')}</strong>
          <p>⌖ ${esc(c.city||c.country||'Localisation non précisée')}</p>
          <p class="card-summary">${esc((c.skills||c.specialty||'').slice(0,140))}</p>
        </div>
        <div class="candidate-card-footer"><button class="btn outline-blue public-candidate-detail" data-candidate="${c.id}">Voir le profil</button>${publicActionForCandidate(c.id)}</div>
      </article>`).join(''):'<div class="panel empty-state">Aucun talent disponible ne correspond à votre recherche.</div>';
    renderDirectoryPagination('#publicCandidatesPagination',pg,p=>loadPublicCandidates(p));
    $$('.candidate-market-card').forEach(card=>{
      card.addEventListener('click',e=>{if(e.target.closest('button'))return;openCandidateDetail(Number(card.dataset.candidate))});
      card.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('button')){e.preventDefault();openCandidateDetail(Number(card.dataset.candidate))}}
    });
    $$('.public-candidate-detail').forEach(b=>b.onclick=e=>{e.stopPropagation();openCandidateDetail(Number(b.dataset.candidate))});
    $$('.public-recruit').forEach(b=>b.onclick=e=>{e.stopPropagation();requirePaidRecruiterAction(()=>recruitFromPublic(Number(b.dataset.candidate)))});
    $$('.public-subscribe-recruiter').forEach(b=>b.onclick=e=>{e.stopPropagation();navigateView('subscription')});
    $$('.public-register-recruiter').forEach(b=>b.onclick=e=>{e.stopPropagation();registerModal('recruiter')});
  }catch(err){
    $('#publicCandidatesCount').textContent='';
    grid.innerHTML=directoryError('Impossible d’afficher les talents.',err);
    bindDirectoryRetry(grid,()=>loadPublicCandidates(page));
  }
}
function renderDirectoryPagination(selector,pg,onPage){
  const box=$(selector);if(!box)return;
  if(!pg||pg.pages<=1){box.innerHTML='';return}
  const current=Number(pg.page||1),pages=Number(pg.pages||1);
  const nums=[];for(let i=Math.max(1,current-2);i<=Math.min(pages,current+2);i++)nums.push(i);
  box.innerHTML=`<button ${current<=1?'disabled':''} data-page="${current-1}">← Précédent</button>${nums.map(n=>`<button class="${n===current?'active':''}" data-page="${n}">${n}</button>`).join('')}<button ${current>=pages?'disabled':''} data-page="${current+1}">Suivant →</button>`;
  box.querySelectorAll('button[data-page]:not([disabled])').forEach(b=>b.onclick=()=>{onPage(Number(b.dataset.page));window.scrollTo({top:document.querySelector(selector.replace('Pagination','Grid'))?.offsetTop||0,behavior:'smooth'})});
}
async function openCandidateDetail(id){
  try{
    const d=await api(`/api/candidates/${id}`),c=d.candidate;
    modal(`<div class="detail-popup">
      <div class="candidate-detail-head">${c.photo?`<img src="${esc(c.photo)}" alt="">`:`<div class="candidate-photo large"><span>${esc(((c.first_name||'P')[0]||'P')+((c.last_name||'')[0]||''))}</span></div>`}
        <div><h2>${esc(`${c.first_name||''} ${c.last_name||''}`.trim()||'Professionnel')}</h2><p><b>${esc(c.professional_title||c.profession||'Profil professionnel')}</b></p><p class="muted">⌖ ${esc(c.city||'—')}, ${esc(c.country||'')}</p></div></div>
      <div class="detail-grid">
        <div><small>Domaine</small><strong>${esc(c.activity_domain||'—')}</strong></div>
        <div><small>Expérience</small><strong>${esc(c.experience_level||c.experience_years||'—')}</strong></div>
        <div><small>Disponibilité</small><strong>${esc(c.availability||'—')}</strong></div>
        <div><small>Poste recherché</small><strong>${esc(c.target_position||'—')}</strong></div>
        <div><small>Contrats souhaités</small><strong>${esc(c.desired_contracts||'—')}</strong></div>
        <div><small>Mobilité</small><strong>${esc(c.mobility||'—')}</strong></div>
      </div>
      <div class="detail-section"><h3>Présentation</h3><p>${esc(c.description||'Aucune présentation renseignée.')}</p></div>
      <div class="detail-section"><h3>Compétences</h3><p>${esc(c.skills||c.other_skills||'—')}</p></div>
      ${d.experiences?.length?`<div class="detail-section"><h3>Expériences</h3>${d.experiences.map(x=>`<div class="mini-record"><b>${esc(x.position||'Poste')}</b> — ${esc(x.company||'')}<br><small>${esc(x.city_country||'')} • ${esc(x.start_date||'')} ${x.current_job?'à aujourd’hui':x.end_date?'à '+esc(x.end_date):''}</small><p>${esc(x.responsibilities||'')}</p></div>`).join('')}</div>`:''}
      ${d.education?.length?`<div class="detail-section"><h3>Formations</h3>${d.education.map(x=>`<div class="mini-record"><b>${esc(x.diploma||'Formation')}</b> • ${esc(x.specialty||'')}<br><small>${esc(x.institution||'')} ${x.graduation_year?'• '+esc(x.graduation_year):''}</small></div>`).join('')}</div>`:''}
      ${d.languages?.length?`<div class="detail-section"><h3>Langues</h3><p>${d.languages.map(x=>`${esc(x.language)} (${esc(x.level||'—')})`).join(' • ')}</p></div>`:''}
      <div class="detail-actions">${publicActionForCandidate(c.id)}</div>
    </div>`);
    $('.public-recruit')?.addEventListener('click',()=>requirePaidRecruiterAction(()=>recruitFromPublic(id)));
    $('.public-subscribe-recruiter')?.addEventListener('click',()=>{closeModal();navigateView('subscription')});
    $('.public-register-recruiter')?.addEventListener('click',()=>{closeModal();registerModal('recruiter')});
  }catch(err){toast(err.message)}
}
async function recruitFromPublic(id){
  try{
    await api(`/api/candidates/${id}/recruit`,{method:'POST',body:JSON.stringify({message:'Je souhaite vous contacter pour une opportunité professionnelle.'})});
    closeModal();toast('Votre demande de recrutement a été envoyée au candidat.');
  }catch(err){
    if(err.code==='HTTP_403'&&state.session?.user?.role==='recruiter'){closeModal();navigateView('subscription')}
    toast(err.message);
  }
}
$('#jobsSearchBtn')?.addEventListener('click',()=>loadPublicJobs(1));
$('#candidatesSearchBtn')?.addEventListener('click',()=>loadPublicCandidates(1));
['jobsSearchQ','jobsSearchCity','jobsSearchCategory'].forEach(id=>$('#'+id)?.addEventListener('keydown',e=>{if(e.key==='Enter')loadPublicJobs(1)}));
['candidatesSearchQ','candidatesSearchCity','candidatesSearchExperience','candidatesSearchEducation','candidatesSearchAvailability'].forEach(id=>$('#'+id)?.addEventListener('keydown',e=>{if(e.key==='Enter')loadPublicCandidates(1)}));

