const $=(s)=>document.querySelector(s), $$=(s)=>[...document.querySelectorAll(s)];
const state={session:null,view:'home',freeTimer:null};
const api=async(path,options={})=>{const r=await fetch(path,{headers:{'content-type':'application/json',...(options.headers||{})},...options});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Erreur');return d};
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),3200)}
function modal(html){$('#modalBody').innerHTML=html;$('#modal').classList.remove('hidden')}
function closeModal(){$('#modal').classList.add('hidden')}
$('#closeModal').onclick=closeModal;$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});

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
function loginModal(){modal(`<h2>Connexion</h2><p class="muted">Accédez à votre espace GLOBAL EMPLOI.</p><form id="loginForm" class="form-grid"><div class="field full"><label>E-mail</label><input name="email" type="email" required></div><div class="field full"><label>Mot de passe</label><div class="password-wrap"><input id="loginPassword" name="password" type="password" required><button class="password-toggle" type="button" data-toggle-password="loginPassword" aria-label="Afficher le mot de passe">◉</button></div></div><div class="full"><button class="btn primary">Se connecter</button></div></form>`);bindPasswordToggles();$('#loginForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{await api('/api/login',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});closeModal();await boot();toast('Connexion réussie');}catch(err){toast(err.message)}}}
function registerModal(role='candidate'){
  const candidate=role==='candidate';
  modal(`<h2>${candidate?'Inscription — Demandeur d’emploi':'Inscription — Recruteur'}</h2>
  <p class="muted">${candidate?'Première étape : vos informations personnelles. Les informations professionnelles seront complétées dans votre compte.':'Première étape : les informations personnelles du recruteur. Les informations de l’entreprise et les besoins de recrutement seront complétés dans votre Espace Recruteur.'}</p>
  <div class="tabs"><button class="tab ${candidate?'active':''}" data-role="candidate">Demandeur d'emploi</button><button class="tab ${!candidate?'active':''}" data-role="recruiter">Recruteur</button></div>
  <form id="registerForm" class="form-grid"><input type="hidden" name="role" value="${role}">
  ${candidate?`
    <div class="form-section full"><h3>1. Informations personnelles</h3></div>
    <div class="field"><label>Nom *</label><input name="last_name" required></div>
    <div class="field"><label>Prénoms *</label><input name="first_name" required></div>
    <div class="field"><label>Sexe</label><select name="gender"><option value="">Sélectionner</option><option>Homme</option><option>Femme</option></select></div>
    <div class="field"><label>Date de naissance *</label><input name="birth_date" type="date" required></div>
    <div class="field"><label>Nationalité *</label><input name="nationality" required></div>
    <div class="field"><label>Situation matrimoniale</label><select name="marital_status"><option value="">Non précisée</option><option>Célibataire</option><option>Marié(e)</option><option>Divorcé(e)</option><option>Veuf / Veuve</option></select></div>
    <div class="field"><label>Numéro de téléphone *</label><input name="phone" type="tel" required></div>
    <div class="field"><label>Numéro WhatsApp</label><input name="whatsapp" type="tel"></div>
    <div class="field"><label>Adresse e-mail *</label><input name="email" type="email" required></div>
    <div class="field"><label>Ville de résidence *</label><input name="city" required></div>
    <div class="field"><label>Commune / Quartier</label><input name="location"></div>
    <div class="field"><label>Pays de résidence *</label><input name="country" value="Côte d’Ivoire" required></div>
    <div class="field full"><label>Photo de profil</label><input id="registerPhoto" type="file" accept="image/jpeg,image/png,image/webp"><small class="muted">JPG, PNG ou WebP — maximum 500 Ko.</small></div>
    <div class="form-section full"><h3>2. Création du compte</h3></div>
    <div class="field"><label>Adresse e-mail / Identifiant *</label><input value="" id="emailMirror" type="email" placeholder="Même e-mail que ci-dessus"></div>
    <div class="field"><label>Mot de passe *</label><input id="regPassword" name="password" type="password" minlength="8" required></div>
    <div class="field"><label>Confirmer le mot de passe *</label><input id="confirmPassword" type="password" minlength="8" required></div>
    <div class="field full check-row"><label><input id="showPasswords" type="checkbox"> Afficher le mot de passe</label></div>
    <div class="field full check-row"><label><input name="terms" type="checkbox" required> J’accepte les Conditions générales d’utilisation et la Politique de confidentialité de GLOBAL EMPLOI.</label></div>
    <div class="field full check-row"><label><input name="job_alerts" type="checkbox"> Je souhaite recevoir des alertes correspondant à mon profil et aux emplois recherchés.</label></div>
  `:`
    <div class="form-section full"><h3>1. Informations personnelles du recruteur</h3><p>Les informations sur l’entreprise seront complétées après votre première connexion.</p></div>
    <div class="field"><label>Nom *</label><input name="last_name" required></div>
    <div class="field"><label>Prénoms *</label><input name="first_name" required></div>
    <div class="field full"><label>Fonction / Poste *</label><input name="job_title" placeholder="Ex. Responsable RH, Directeur, Gérant, Chargé de recrutement…" required></div>
    <div class="field"><label>Numéro de téléphone *</label><input name="phone" type="tel" required></div>
    <div class="field"><label>Numéro WhatsApp</label><input name="whatsapp" type="tel"></div>
    <div class="field"><label>Adresse e-mail professionnelle *</label><input name="email" type="email" required></div>
    <div class="field"><label>Ville de résidence</label><input name="city"></div>
    <div class="field"><label>Pays de résidence *</label><input name="country" value="Côte d’Ivoire" required></div>
    <div class="field full"><label>Photo de profil (facultative)</label><input id="registerPhoto" type="file" accept="image/jpeg,image/png,image/webp"><small class="muted">JPG, PNG ou WebP — maximum 500 Ko.</small></div>
    <div class="form-section full"><h3>2. Création du compte</h3></div>
    <div class="field"><label>Adresse e-mail / Identifiant *</label><input value="" id="emailMirror" type="email" placeholder="Même e-mail professionnel"></div>
    <div class="field"><label>Mot de passe *</label><input id="regPassword" name="password" type="password" minlength="8" required></div>
    <div class="field"><label>Confirmer le mot de passe *</label><input id="confirmPassword" type="password" minlength="8" required></div>
    <div class="field full check-row"><label><input id="showPasswords" type="checkbox"> Afficher le mot de passe</label></div>
    <div class="field full check-row"><label><input name="terms" type="checkbox" required> J’accepte les Conditions générales d’utilisation de GLOBAL EMPLOI.</label></div>
    <div class="field full check-row"><label><input name="privacy" type="checkbox" required> J’accepte la Politique de confidentialité de GLOBAL EMPLOI.</label></div>
    <div class="field full check-row"><label><input name="marketing_alerts" type="checkbox"> Je souhaite recevoir des informations et alertes de GLOBAL EMPLOI.</label></div>
  `}
  <div class="full"><button class="btn primary full-btn">${candidate?'CRÉER MON COMPTE':'CRÉER MON COMPTE RECRUTEUR'}</button>
  <p class="centered-login">Vous avez déjà un compte ? <button type="button" id="switchLogin" class="link-btn">Se connecter</button></p></div>
  </form>`);
  $$('.tab').forEach(b=>b.onclick=()=>registerModal(b.dataset.role));
  $('#switchLogin').onclick=loginModal;
  const mainEmail=$('#registerForm input[name="email"]'),mirror=$('#emailMirror');
  mainEmail?.addEventListener('input',()=>mirror.value=mainEmail.value);
  mirror?.addEventListener('input',()=>mainEmail.value=mirror.value);
  $('#showPasswords').onchange=e=>{$('#regPassword').type=e.target.checked?'text':'password';$('#confirmPassword').type=e.target.checked?'text':'password'};
  $('#registerForm').onsubmit=async e=>{
    e.preventDefault();
    if($('#regPassword').value!==$('#confirmPassword').value)return toast('Les mots de passe ne correspondent pas.');
    const fd=new FormData(e.target),f=Object.fromEntries(fd);
    f.job_alerts=fd.get('job_alerts')==='on'; f.marketing_alerts=fd.get('marketing_alerts')==='on'; f.terms=fd.get('terms')==='on'; f.privacy=fd.get('privacy')==='on';
    const file=$('#registerPhoto')?.files?.[0];
    if(file){if(file.size>500*1024)return toast('La photo dépasse 500 Ko.');f.photo=await fileToDataURL(file)}
    try{
      await api('/api/register',{method:'POST',body:JSON.stringify(f)});
      closeModal(); await boot();
      toast(candidate?'Compte créé. Complétez maintenant votre profil professionnel.':'Compte recruteur créé. Complétez maintenant votre Profil entreprise.');
    }catch(err){toast(err.message)}
  };
}

$('#loginBtn').onclick=loginModal;$('#registerBtn').onclick=()=>registerModal();$$('[data-open-register]').forEach(b=>b.onclick=()=>registerModal(b.dataset.openRegister));

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
    ['dashboard','⌂','Tableau de bord'],['profile','▣','Profil entreprise'],['jobs','＋','Publier une offre'],['myjobs','▤','Mes offres'],['applications','✓','Candidatures reçues'],['candidates','♙','Recherche de candidats'],['favorites','☆','Favoris'],['messages','✉','Messages'],['subscription','◈','Abonnement'],['payments','¤','Paiements'],['settings','⚙','Paramètres']
  ];
  if(role==='candidate')return [
    ['dashboard','⌂','Tableau de bord'],['profile','♙','Mon profil'],['jobs','▣','Offres d’emploi'],['recruitment','★','Propositions reçues'],['candidates','♧','Profils professionnels'],['messages','✉','Messages'],['subscription','◈','Abonnement'],['settings','⚙','Paramètres']
  ];
  return [['dashboard','⌂','Tableau de bord'],['admin','◆','Administration'],['messages','✉','Messages'],['settings','⚙','Paramètres']];
}
function buildAccountMenu(){const u=state.session?.user;if(!u)return;const role=roleLabel(u.role);$('#accountLabel').textContent='Mon compte';$('#menuAccountEmail').textContent=u.email;$('#menuAccountRole').textContent=role;$('#menuAccountName').textContent=u.email.split('@')[0]||'Mon compte';const nav=$('#accountMenuItems');nav.innerHTML=accountItems(u.role).map(([view,icon,label])=>`<button class="account-menu-link ${state.view===view?'active':''}" type="button" data-account-view="${view}" role="menuitem"><span>${icon}</span><b>${label}</b></button>`).join('');$$('[data-account-view]').forEach(b=>b.onclick=()=>{navigateView(b.dataset.accountView);closeAccountMenu()});loadAccountDisplayName()}
async function loadAccountDisplayName(){try{const d=await api('/api/profile'),p=d.profile||{};const full=[p.first_name,p.last_name].filter(Boolean).join(' ').trim();const company=p.company_name||p.commercial_name||'';const label=company||full;if(label){$('#accountLabel').textContent=label.length>20?label.slice(0,20)+'…':label;$('#menuAccountName').textContent=label}}catch{}}
function syncViewNavigation(view){$$('[data-account-view]').forEach(x=>x.classList.toggle('active',x.dataset.accountView===view))}
function showPublicHome(anchor='home'){
  state.view='home';
  $('#guestHome').classList.remove('hidden');
  $('#app').classList.add('hidden');
  syncViewNavigation('home');
  closeAccountMenu();
  if(anchor){setTimeout(()=>document.getElementById(anchor)?.scrollIntoView({behavior:'smooth',block:'start'}),20)}
}
function navigateView(view){
  if(!state.session)return loginModal();
  $('#guestHome').classList.add('hidden');
  $('#app').classList.remove('hidden');
  syncViewNavigation(view);
  render(view);
  window.scrollTo({top:0,behavior:'smooth'});
}

async function boot(){
  try{state.session=await api('/api/session');showConnectedHome();scheduleFreePopup();}
  catch{state.session=null;showGuest();}
}
function showGuest(){state.view='home';$('#guestHome').classList.remove('hidden');$('#app').classList.add('hidden');$('#loginBtn').classList.remove('hidden');$('#registerBtn').classList.remove('hidden');$('#accountControl').classList.add('hidden');closeAccountMenu()}
function showConnectedHome(){const u=state.session.user;state.view='home';$('#guestHome').classList.remove('hidden');$('#app').classList.add('hidden');$('#loginBtn').classList.add('hidden');$('#registerBtn').classList.add('hidden');$('#accountControl').classList.remove('hidden');buildAccountMenu();updateSubChip();syncViewNavigation('home')}
function updateSubChip(){const s=state.session.subscription;if(!s){$('#subscriptionChip').textContent='Aucun abonnement';return}const d=new Date(s.expires_at).toLocaleDateString('fr-FR');$('#subscriptionChip').textContent=`${s.plan.toUpperCase()} • jusqu'au ${d}`}
$('#backHomeBtn')?.addEventListener('click',()=>showPublicHome('home'));
async function render(view){state.view=view;syncViewNavigation(view);const c=$('#viewContent'),t=$('#viewTitle');const names={dashboard:'Tableau de bord',profile:state.session?.user?.role==='recruiter'?'Profil entreprise':'Mon profil',jobs:"Publier une offre / Offres d'emploi",myjobs:'Mes offres',applications:'Candidatures reçues',recruitment:'Propositions reçues',candidates:'Recherche de candidats',favorites:'Favoris',messages:'Messages',subscription:'Abonnement',payments:'Paiements',settings:'Paramètres',admin:'Administration'};t.textContent=names[view]||view;c.innerHTML='<div class="panel">Chargement…</div>';try{if(view==='dashboard')return renderDashboard();if(view==='profile')return renderProfile();if(view==='jobs')return renderJobs();if(view==='myjobs')return renderMyJobs();if(view==='applications')return renderRecruiterApplications();if(view==='recruitment')return renderRecruitmentRequests();if(view==='candidates')return renderCandidates();if(view==='favorites')return renderFavorites();if(view==='messages')return renderMessages();if(view==='subscription'||view==='payments')return renderSubscription();if(view==='settings')return renderSettings();if(view==='admin')return renderAdmin();}catch(e){c.innerHTML=`<div class="panel"><b>Erreur :</b> ${esc(e.message)}</div>`}}

async function renderDashboard(){const u=state.session.user,s=state.session.subscription;if(u.role==='candidate'){let c={percent:0,recommendations:[]};try{c=await api('/api/profile/completeness')}catch{}$('#viewContent').innerHTML=`<div class="profile-progress-card"><div><span class="section-kicker">VOTRE PROFIL</span><h3>Profil complété à ${c.percent}%</h3><p class="muted">Un profil complet améliore votre présentation auprès des recruteurs.</p></div><div class="progress-ring"><strong>${c.percent}%</strong></div><div class="progress-track"><span style="width:${c.percent}%"></span></div>${c.recommendations.length?`<div class="recommendations">${c.recommendations.slice(0,4).map(x=>`<button class="recommendation go-profile">+ ${esc(x)}</button>`).join('')}</div>`:''}</div><div class="grid"><div class="card metric"><span>Type de compte</span><strong>Demandeur</strong></div><div class="card metric"><span>Formule</span><strong>${s?.plan?.toUpperCase()||'—'}</strong></div><div class="card metric"><span>Statut</span><strong>${s?.effective_status==='active'?'Actif':'Expiré'}</strong></div><div class="card metric"><span>Profil</span><strong>${c.percent}%</strong></div></div>`;$$('.go-profile').forEach(b=>b.onclick=()=>render('profile'));return}if(u.role==='recruiter'){let d={completeness:{percent:0,recommendations:[],verification_status:'unverified'}};try{d=await api('/api/profile')}catch{}const c=d.completeness||{percent:0,recommendations:[],verification_status:'unverified'};const vs=c.verification_status==='verified'?'Entreprise vérifiée ✓':c.verification_status==='pending'?'Vérification en cours':'Compte non vérifié';$('#viewContent').innerHTML=`<div class="verification-card ${c.verification_status||'unverified'}"><div><span class="section-kicker">ESPACE RECRUTEUR</span><h3>${vs}</h3><p>Profil entreprise complété à ${c.percent}%.</p></div><button class="btn ghost go-profile">Compléter le profil</button></div><div class="grid"><div class="card metric"><span>Type de compte</span><strong>Recruteur</strong></div><div class="card metric"><span>Formule</span><strong>${s?.plan?.toUpperCase()||'—'}</strong></div><div class="card metric"><span>Vérification</span><strong>${c.verification_status==='verified'?'✓':'…'}</strong></div><div class="card metric"><span>Profil</span><strong>${c.percent}%</strong></div></div>`;$('.go-profile')?.addEventListener('click',()=>render('profile'));return}$('#viewContent').innerHTML=`<div class="grid"><div class="card metric"><span>Type de compte</span><strong>Super Admin</strong></div><div class="card metric"><span>Administration</span><strong>✓</strong></div></div>`}

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
const edu=d.education||[],exp=d.experiences||[],langs=d.languages||[],docs=d.documents||[],comp=d.completeness||{percent:0,recommendations:[]};$('#viewContent').innerHTML=`<div class="profile-progress-card compact"><div><span class="section-kicker">COMPLÉTUDE DU PROFIL</span><h3>Profil complété à ${comp.percent}%</h3><p class="muted">${comp.recommendations.length?comp.recommendations.join(' • '):'Votre profil est très bien renseigné.'}</p></div><div class="progress-track"><span style="width:${comp.percent}%"></span></div></div><form id="profileForm" class="candidate-profile-form"><section class="profile-section"><div class="section-number">1</div><div class="section-title"><h3>Informations personnelles</h3><p>Vos coordonnées et informations de résidence.</p></div><div class="form-grid"><div class="field"><label>Nom *</label><input name="last_name" value="${esc(p.last_name)}" required></div><div class="field"><label>Prénoms *</label><input name="first_name" value="${esc(p.first_name)}" required></div><div class="field"><label>Sexe</label><select name="gender">${opts(['','Homme','Femme'],p.gender)}</select></div><div class="field"><label>Date de naissance *</label><input type="date" name="birth_date" value="${esc(p.birth_date)}" required></div><div class="field"><label>Nationalité *</label><input name="nationality" value="${esc(p.nationality)}" required></div><div class="field"><label>Situation matrimoniale</label><input name="marital_status" value="${esc(p.marital_status)}"></div><div class="field"><label>Numéro WhatsApp</label><input name="whatsapp" value="${esc(p.whatsapp)}"></div><div class="field"><label>Ville de résidence *</label><input name="city" value="${esc(p.city)}" required></div><div class="field"><label>Commune / Quartier</label><input name="location" value="${esc(p.location)}"></div><div class="field"><label>Pays de résidence *</label><input name="country" value="${esc(p.country||'Côte d’Ivoire')}" required></div></div></section><section class="profile-section"><div class="section-number">2</div><div class="section-title"><h3>Informations professionnelles</h3></div><div class="form-grid"><div class="field"><label>Titre du profil professionnel *</label><input name="professional_title" value="${esc(p.professional_title)}" placeholder="Ex. Comptable, Chauffeur, Maçon…" required></div><div class="field"><label>Domaine d’activité *</label><input name="activity_domain" value="${esc(p.activity_domain)}" required></div><div class="field"><label>Métier principal *</label><input name="profession" value="${esc(p.profession)}" required></div><div class="field"><label>Niveau d’expérience</label><select name="experience_level">${opts(['Sans expérience','Moins de 1 an','1 à 3 ans','3 à 5 ans','5 à 10 ans','Plus de 10 ans'],p.experience_level)}</select></div><div class="field"><label>Situation actuelle</label><select name="current_situation">${opts(['Sans emploi','Employé','Travailleur indépendant','Stagiaire','Étudiant','En reconversion professionnelle'],p.current_situation)}</select></div><div class="field full"><label>Autres métiers / compétences</label><textarea name="other_skills">${esc(p.other_skills)}</textarea></div><div class="field full"><label>Présentation / Profil professionnel</label><textarea name="description">${esc(p.description)}</textarea></div><div class="field full"><label>Compétences principales</label><textarea name="skills">${esc(p.skills)}</textarea></div><div class="field"><label>Permis de conduire</label><select name="driving_license">${optsVal([['0','Non'],['1','Oui']],String(p.driving_license||0))}</select></div><div class="field"><label>Catégorie du permis</label><input name="driving_category" value="${esc(p.driving_category)}"></div></div></section><section class="profile-section"><div class="section-number">3</div><div class="section-title"><h3>Formation et diplômes</h3></div><div class="form-grid"><div class="field"><label>Niveau d’étude *</label><select name="education_level" required>${opts(['Aucun diplôme','Primaire','BEPC','CAP','BT','BAC','BTS','Licence','Master','Doctorat','Autre'],p.education_level)}</select></div></div><div id="educationList">${edu.map(educationRow).join('')}</div><button type="button" id="addEducation" class="btn ghost">+ Ajouter un autre diplôme</button></section><section class="profile-section"><div class="section-number">4</div><div class="section-title"><h3>Expériences professionnelles</h3></div><div id="experienceList">${exp.map(experienceRow).join('')}</div><button type="button" id="addExperience" class="btn ghost">+ Ajouter une expérience</button></section><section class="profile-section"><div class="section-number">5</div><div class="section-title"><h3>Recherche d’emploi</h3></div><div class="form-grid"><div class="field"><label>Poste recherché *</label><input name="target_position" value="${esc(p.target_position)}" required></div><div class="field"><label>Domaine recherché *</label><input name="target_domain" value="${esc(p.target_domain)}" required></div><div class="field full"><label>Type de contrat souhaité</label><div class="choice-grid">${checks(['CDI','CDD','Stage','Intérim','Freelance','Journalier','Temps partiel'],p.desired_contracts,'contract_choice')}</div></div><div class="field"><label>Ville souhaitée</label><input name="desired_city" value="${esc(p.desired_city)}"></div><div class="field"><label>Mobilité</label><select name="mobility">${opts(['Ma ville uniquement','Partout en Côte d’Ivoire','À l’international'],p.mobility)}</select></div><div class="field"><label>Disponibilité</label><select name="availability">${opts(['Immédiatement','Sous 15 jours','Sous 1 mois','À préciser'],p.availability)}</select></div><div class="field"><label>Salaire souhaité (FCFA / mois)</label><input name="desired_salary" type="number" min="0" value="${p.desired_salary||''}"></div><div class="field"><label>Déplacements professionnels</label><select name="accepts_travel">${optsVal([['0','Non'],['1','Oui']],String(p.accepts_travel||0))}</select></div></div></section><section class="profile-section"><div class="section-number">6</div><div class="section-title"><h3>Documents</h3><p>PDF, DOC, DOCX, JPG ou PNG — 700 Ko maximum par fichier.</p></div><div class="documents-grid">${documentUploader('cv','Télécharger mon CV')}${documentUploader('motivation','Lettre de motivation')}${documentUploader('diploma','Diplômes / Certificats')}${documentUploader('work_certificate','Attestations de travail')}${documentUploader('identity','Pièce d’identité (facultative)')}</div><div id="documentList" class="document-list">${docs.map(x=>`<span class="doc-chip">${esc(x.file_name)} <button type="button" data-doc-delete="${x.id}">×</button></span>`).join('')}</div></section><section class="profile-section"><div class="section-number">7</div><div class="section-title"><h3>Langues</h3></div><div id="languageList">${langs.map(languageRow).join('')}</div><button type="button" id="addLanguage" class="btn ghost">+ Ajouter une langue</button></section><section class="profile-section"><div class="section-number">8</div><div class="section-title"><h3>Préférences du compte</h3></div><label class="check-row"><input type="checkbox" name="job_alerts" ${p.job_alerts?'checked':''}> Je souhaite recevoir des alertes correspondant à mon profil et aux emplois recherchés.</label></section><div class="sticky-save"><button class="btn primary big">ENREGISTRER MON PROFIL</button></div></form>`;bindDynamicProfile();$('#profileForm').onsubmit=saveCandidateProfile;bindDocumentUploads();}

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
async function renderMyJobs(){if(state.session.user.role!=='recruiter')return renderJobs();const d=await api('/api/recruiter/jobs');$('#viewContent').innerHTML=`<div class="panel"><div class="section-head"><div><h3>Mes offres</h3><p class="muted">${d.jobs.length} offre(s) enregistrée(s).</p></div><button class="btn primary" id="newJobFromMine">Publier une offre</button></div><div class="cards">${d.jobs.map(j=>`<article class="job"><span class="pill">${esc(j.status||'published')}</span><h4>${esc(j.title)}</h4><p>${esc(j.location||'Lieu non précisé')} • ${esc(j.employment_type||'')}</p><small>${new Date(j.created_at).toLocaleDateString('fr-FR')}</small></article>`).join('')||'<p class="muted">Aucune offre publiée.</p>'}</div></div>`;$('#newJobFromMine')?.addEventListener('click',()=>render('jobs'))}
async function renderRecruiterApplications(){
  if(state.session.user.role!=='recruiter')return $('#viewContent').innerHTML='<div class="panel">Section réservée aux recruteurs.</div>';
  const d=await api('/api/recruiter/applications');
  $('#viewContent').innerHTML=`<div class="panel"><div class="section-head"><div><span class="section-kicker">LISTE SPÉCIALE</span><h3>Postulants à mes offres</h3><p>${d.applications.length} candidature${d.applications.length>1?'s':''} reçue${d.applications.length>1?'s':''}.</p></div></div>
  <div class="application-cards">${d.applications.map(a=>`<article class="application-card">
    <div><span class="pill">${esc(a.status||'submitted')}</span><h4>${esc(((a.first_name||'')+' '+(a.last_name||'')).trim()||a.email)}</h4><p><b>${esc(a.professional_title||a.profession||'Candidat')}</b> • ${esc(a.city||a.country||'')}</p></div>
    <div class="application-info"><span><small>Offre</small>${esc(a.title)}</span><span><small>Téléphone</small>${esc(a.phone||'—')}</span><span><small>E-mail</small>${esc(a.email||'—')}</span><span><small>Expérience</small>${esc(a.experience_level||a.experience_years||'—')}</span></div>
    <p>${esc((a.skills||a.description||'').slice(0,220))}</p>
    ${a.message?`<div class="application-message"><b>Message du candidat :</b> ${esc(a.message)}</div>`:''}
    <div class="application-actions"><button class="btn outline-blue applicant-detail" data-id="${a.id}">Voir les informations</button><button class="btn primary message-user" data-id="${a.candidate_id}">Envoyer un message</button></div>
  </article>`).join('')||'<div class="empty-state">Aucune candidature reçue pour le moment.</div>'}</div></div>`;
  const byId=new Map(d.applications.map(a=>[String(a.id),a]));
  $$('.applicant-detail').forEach(b=>b.onclick=()=>{const a=byId.get(b.dataset.id);modal(`<h2>${esc(((a.first_name||'')+' '+(a.last_name||'')).trim()||a.email)}</h2><div class="detail-grid"><div><small>Poste / profil</small><strong>${esc(a.professional_title||a.profession||'—')}</strong></div><div><small>Ville</small><strong>${esc(a.city||a.country||'—')}</strong></div><div><small>Téléphone</small><strong>${esc(a.phone||'—')}</strong></div><div><small>E-mail</small><strong>${esc(a.email||'—')}</strong></div><div><small>Expérience</small><strong>${esc(a.experience_level||a.experience_years||'—')}</strong></div><div><small>Disponibilité</small><strong>${esc(a.availability||'—')}</strong></div></div><div class="detail-section"><h3>Compétences</h3><p>${esc(a.skills||'—')}</p></div><div class="detail-section"><h3>Poste recherché</h3><p>${esc(a.target_position||'—')} • ${esc(a.desired_contracts||'')}</p></div><div class="detail-actions"><button class="btn primary modal-message" data-id="${a.candidate_id}">Envoyer un message</button></div>`);$('.modal-message')?.addEventListener('click',()=>{closeModal();messageModal(Number(a.candidate_id))})});
  $$('.message-user').forEach(b=>b.onclick=()=>messageModal(Number(b.dataset.id)));
}

async function renderRecruitmentRequests(){
  if(state.session.user.role!=='candidate')return $('#viewContent').innerHTML='<div class="panel">Section réservée aux demandeurs d’emploi.</div>';
  const d=await api('/api/candidate/recruitment-requests');
  $('#viewContent').innerHTML=`<div class="panel"><h3>Propositions de recrutement reçues</h3><p class="muted">Les recruteurs qui cliquent sur « Je recrute » apparaissent ici.</p>
    <div class="application-cards">${d.requests.map(r=>`<article class="application-card"><div><span class="pill">${esc(r.status||'sent')}</span><h4>${esc(r.company_name||r.trade_name||'Recruteur GLOBAL EMPLOI')}</h4><p>${esc(r.job_title||r.email||'Recruteur')}</p></div>${r.message?`<div class="application-message">${esc(r.message)}</div>`:''}<div class="application-actions"><button class="btn primary message-user" data-id="${r.recruiter_id}">Répondre par message</button></div></article>`).join('')||'<div class="empty-state">Aucune proposition reçue pour le moment.</div>'}</div>
  </div>`;
  $$('.message-user').forEach(b=>b.onclick=()=>messageModal(Number(b.dataset.id)));
}

async function renderCandidates(){const d=await api('/api/candidates');$('#viewContent').innerHTML=`<div class="cards">${d.candidates.length?d.candidates.map(p=>`<article class="person"><span class="pill">${esc(p.availability||'Profil')}</span><h4>${esc(`${p.first_name||''} ${p.last_name||''}`.trim()||'Professionnel')}</h4><p><b>${esc(p.profession||'Métier non précisé')}</b><br>${esc(p.specialty||'')} ${p.city?'• '+esc(p.city):''}</p><p>${esc((p.skills||'').slice(0,150))}</p>${state.session.user.role==='recruiter'?`<button class="btn primary message-user" data-id="${p.id}">Message</button>`:''}</article>`).join(''):'<div class="panel">Aucun profil disponible.</div>'}</div>`;$$('.message-user').forEach(b=>b.onclick=()=>messageModal(Number(b.dataset.id)))}
function messageModal(receiver){modal(`<h2>Envoyer un message</h2><form id="messageForm"><div class="field"><label>Message</label><textarea name="content" required></textarea></div><br><button class="btn primary">Envoyer</button></form>`);$('#messageForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/messages',{method:'POST',body:JSON.stringify({receiver_id:receiver,content:new FormData(e.target).get('content')})});closeModal();toast('Message envoyé')}catch(err){toast(err.message)}}}
async function renderMessages(){const d=await api('/api/conversations');$('#viewContent').innerHTML=`<div class="panel"><h3>Conversations</h3>${d.conversations.length?d.conversations.map(x=>`<div class="card" style="margin:10px 0"><b>Conversation #${x.id}</b><p class="muted">${esc(x.last_message||'Aucun message')}</p><button class="btn ghost open-conv" data-id="${x.id}">Ouvrir</button></div>`).join(''):'<p class="muted">Aucune conversation.</p>'}</div>`;$$('.open-conv').forEach(b=>b.onclick=async()=>{const m=await api(`/api/messages?conversation_id=${b.dataset.id}`);modal(`<h2>Conversation #${b.dataset.id}</h2><div>${m.messages.map(x=>`<div class="card" style="margin:8px 0"><small>${x.sender_id===state.session.user.id?'Moi':'Correspondant'} • ${new Date(x.created_at).toLocaleString('fr-FR')}</small><p>${esc(x.content)}</p></div>`).join('')}</div>`)});}

function renderSubscription(){const s=state.session.subscription;$('#viewContent').innerHTML=`<div class="plans"><div class="plan"><h3>FREE</h3><div class="price">0 F</div><p>7 jours</p><small class="free-warning">Consultation uniquement : impossible de postuler ou recruter. Sans activation STANDARD/BUSINESS avant la fin des 7 jours, le compte FREE est automatiquement supprimé.</small></div><div class="plan featured"><h3>STANDARD</h3><div class="price">1 000 F</div><p>30 jours</p><a class="btn primary" href="https://pay.wave.com/m/M_ci_Enx-2JNAklk-/c/ci/?amount=1000" target="_blank" rel="noopener">Payer avec Wave</a></div><div class="plan"><h3>BUSINESS</h3><div class="price">10 000 F</div><p>365 jours</p><a class="btn primary" href="https://pay.wave.com/m/M_ci_Enx-2JNAklk-/c/ci/?amount=10000" target="_blank" rel="noopener">Payer avec Wave</a></div></div><div class="panel" style="margin-top:18px"><h3>Mon abonnement actuel</h3><p><b>${s?.plan?.toUpperCase()||'Aucun'}</b> • expiration : ${s?new Date(s.expires_at).toLocaleString('fr-FR'):'—'}</p><button id="activateBtn" class="btn primary">Activer mon abonnement</button></div>`;$('#activateBtn').onclick=activationModal}
function activationModal(){modal(`<h2>Activer mon abonnement</h2><form id="activationForm" class="form-grid"><div class="field full"><label>Version achetée</label><select name="plan"><option value="standard">STANDARD — 1 000 FCFA</option><option value="business">BUSINESS — 10 000 FCFA</option></select></div><div class="field"><label>N° téléphone ayant payé</label><input name="payer_phone" required></div><div class="field"><label>ID de transaction</label><input name="transaction_id" required></div><div class="full" style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" id="waSend" class="btn ghost">Envoyer par WhatsApp</button><button class="btn primary">Envoyer au Support</button></div></form>`);$('#waSend').onclick=()=>{const f=new FormData($('#activationForm')),plan=f.get('plan'),amount=plan==='business'?10000:1000;const txt=`Demande d'activation GLOBAL EMPLOI\nCompte : ${state.session.user.email}\nType : ${state.session.user.role}\nFormule : ${plan}\nMontant : ${amount} FCFA\nTéléphone paiement : ${f.get('payer_phone')||''}\nID transaction : ${f.get('transaction_id')||''}`;window.open(`https://wa.me/2250777041790?text=${encodeURIComponent(txt)}`,'_blank')};$('#activationForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/subscription-request',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});closeModal();toast('Demande envoyée au support')}catch(err){toast(err.message)}}}

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
  try{await api(`/api/admin/recruiters/${id}/${action}`,{method:'POST',body:JSON.stringify({note:action==='reject'?'Veuillez compléter ou corriger les informations de vérification.':''})});toast(action==='verify'?'Entreprise vérifiée avec succès.':'Demande renvoyée au recruteur.');renderAdmin()}catch(err){toast(err.message)}
}

async function adminDeleteUser(id,email){
  if(!confirm(`Supprimer définitivement le compte ${email} et toutes ses publications liées ?`))return;
  try{await api(`/api/admin/users/${id}`,{method:'DELETE'});toast('Compte et publications supprimés.');renderAdmin()}catch(err){toast(err.message)}
}

async function adminAction(id,action){try{await api(`/api/admin/subscription-requests/${id}/${action}`,{method:'POST',body:'{}'});toast(action==='approve'?'Abonnement activé':'Demande rejetée');renderAdmin()}catch(err){toast(err.message)}}

function scheduleFreePopup(){
  clearInterval(state.freeTimer);
  const s=state.session.subscription;
  if(!s||s.plan!=='free'||s.effective_status!=='active')return;
  state.freeTimer=setInterval(()=>{
    if(!$('#modal').classList.contains('hidden'))return;
    modal(`<h2>Votre accès FREE est limité à 7 jours</h2>
      <p class="muted">Vous pouvez consulter toutes les pages, les offres visibles et les profils publiés, mais vous ne pouvez pas encore utiliser « Je postule » ou « Je recrute ».</p>
      <div class="free-expiry-alert"><b>Important :</b> si votre abonnement STANDARD ou BUSINESS n’est pas activé avant la fin de vos 7 jours FREE, votre compte et ses publications seront automatiquement supprimés. Après l’expiration d’un abonnement payant, votre compte repasse également en FREE pendant 7 jours : il est masqué jusqu’au renouvellement et sera supprimé si aucun nouvel abonnement payant n’est activé avant la fin de ce délai.</div>
      <div class="plans" style="grid-template-columns:1fr 1fr">
        <div class="plan featured"><h3>STANDARD</h3><div class="price">1 000 F</div><p>30 jours</p><a class="btn primary" target="_blank" rel="noopener" href="https://pay.wave.com/m/M_ci_Enx-2JNAklk-/c/ci/?amount=1000">Choisir STANDARD</a></div>
        <div class="plan"><h3>BUSINESS</h3><div class="price">10 000 F</div><p>365 jours</p><a class="btn primary" target="_blank" rel="noopener" href="https://pay.wave.com/m/M_ci_Enx-2JNAklk-/c/ci/?amount=10000">Choisir BUSINESS</a></div>
      </div><br><button class="btn ghost" onclick="document.querySelector('#modal').classList.add('hidden')">Plus tard</button>`);
  },300000)
}

const mobileMenuBtn=$('#mobileMenuBtn');
if(mobileMenuBtn){mobileMenuBtn.onclick=()=>{const nav=$('#publicNav');const open=nav.classList.toggle('open');mobileMenuBtn.setAttribute('aria-expanded',String(open));};$$('#publicNav a').forEach(a=>a.addEventListener('click',()=>{$('#publicNav').classList.remove('open');mobileMenuBtn.setAttribute('aria-expanded','false')}));}
$$('[data-search]').forEach(b=>b.onclick=()=>{const input=$('#homeSearch');if(input)input.value=b.dataset.search||b.textContent.trim();input?.focus();});
$('#homeSearchBtn').onclick=()=>{const q=$('#homeSearch')?.value?.trim()||'';const city=$('#homeLocation')?.value?.trim()||'';openPublicPage('jobs');setTimeout(()=>{if($('#jobsSearchQ'))$('#jobsSearchQ').value=q;if($('#jobsSearchCity'))$('#jobsSearchCity').value=city;loadPublicJobs();},0)};
boot();

function openPublicPage(page){
  const sections=[...document.querySelectorAll('#guestHome > section')];
  const target=document.getElementById(page);
  if(!target) return;
  sections.forEach(s=>s.classList.toggle('public-page-hidden', s.id!==page));
  document.querySelectorAll('#publicNav a').forEach(a=>{
    const p=a.dataset.publicPage || (a.getAttribute('href')==='#home'?'home':'');
    a.classList.toggle('active',p===page);
  });
  window.scrollTo({top:0,behavior:'smooth'});
  history.replaceState(null,'',`#${page}`);
  if(page==='jobs') loadPublicJobs();
  if(page==='candidates') loadPublicCandidates();
}
document.querySelectorAll('[data-public-page]').forEach(a=>a.addEventListener('click',e=>{
  e.preventDefault(); openPublicPage(a.dataset.publicPage);
}));
document.querySelector('#publicNav a[href="#home"]')?.addEventListener('click',e=>{
  e.preventDefault();
  document.querySelectorAll('#guestHome > section').forEach(s=>s.classList.remove('public-page-hidden'));
  document.querySelectorAll('#publicNav a').forEach(x=>x.classList.remove('active'));
  e.currentTarget.classList.add('active');
  history.replaceState(null,'','#home');
  window.scrollTo({top:0,behavior:'smooth'});
});
document.getElementById('contactLoginBtn')?.addEventListener('click',loginModal);
bindPasswordToggles();

function roleNow(){return state.session?.user?.role||null}
function hasActivePaidPlan(){
  const s=state.session?.subscription;
  return !!(s && s.effective_status==='active' && (s.plan==='standard'||s.plan==='business'));
}
function formatDateFR(v){if(!v)return '—';try{return new Date(v).toLocaleDateString('fr-FR')}catch{return String(v)}}
function publicActionForJob(jobId){
  const role=roleNow();
  if(role==='candidate'){
    if(hasActivePaidPlan()) return `<button class="btn primary public-apply" data-job="${jobId}">Je postule</button>`;
    return `<button class="btn disabled-action" type="button" disabled>Je postule — STANDARD/BUSINESS requis</button>`;
  }
  if(role==='recruiter') return `<span class="role-note">La candidature est réservée aux demandeurs d’emploi.</span>`;
  return `<button class="btn outline-blue public-login-apply" data-job="${jobId}">Se connecter pour postuler</button>`;
}
function publicActionForCandidate(candidateId){
  const role=roleNow();
  if(role==='recruiter'){
    if(hasActivePaidPlan()) return `<button class="btn primary public-recruit" data-candidate="${candidateId}">Je recrute</button>`;
    return `<button class="btn disabled-action" type="button" disabled>Je recrute — STANDARD/BUSINESS requis</button>`;
  }
  if(role==='candidate') return `<span class="role-note">Action réservée aux recruteurs.</span>`;
  return `<button class="btn outline-blue public-login-recruiter" data-candidate="${candidateId}">Se connecter comme recruteur</button>`;
}
async function loadPublicJobs(){
  const grid=$('#publicJobsGrid'); if(!grid)return;
  const q=$('#jobsSearchQ')?.value?.trim()||'', city=$('#jobsSearchCity')?.value?.trim()||'';
  grid.innerHTML='<div class="panel">Chargement des offres…</div>';
  try{
    const d=await api(`/api/jobs?q=${encodeURIComponent(q)}&city=${encodeURIComponent(city)}`);
    $('#publicJobsCount').textContent=`${d.jobs.length} offre${d.jobs.length>1?'s':''} trouvée${d.jobs.length>1?'s':''}`;
    grid.innerHTML=d.jobs.length?d.jobs.map(j=>`
      <article class="offer-card job-market-card clickable-card" data-job="${j.id}" tabindex="0">
        <div class="offer-top"><div class="company-logo">${esc((j.company_name||'GE').slice(0,2).toUpperCase())}</div><span class="offer-badge new">${esc((j.plan||'standard').toUpperCase())}</span></div>
        <h3>${esc(j.title)}</h3>
        <p class="company">${esc(j.company_name||'Recruteur GLOBAL EMPLOI')}</p>
        <div class="offer-meta"><span>⌖ ${esc(j.location||'Lieu non précisé')}</span><span>▣ ${esc(j.employment_type||'Type non précisé')}</span></div>
        <p class="card-summary">${esc((j.description||'').slice(0,150))}${(j.description||'').length>150?'…':''}</p>
        <div class="offer-footer"><small>Publié le ${formatDateFR(j.created_at)}</small><span>Voir le détail →</span></div>
      </article>`).join(''):'<div class="panel empty-state">Aucune offre payante active ne correspond à votre recherche.</div>';
    $$('.job-market-card').forEach(card=>{
      card.onclick=()=>openJobDetail(Number(card.dataset.job));
      card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openJobDetail(Number(card.dataset.job))}}
    });
  }catch(err){grid.innerHTML=`<div class="panel">${esc(err.message)}</div>`}
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
    $('.public-apply')?.addEventListener('click',()=>applyFromPublic(id));
    $('.public-login-apply')?.addEventListener('click',()=>{closeModal();loginModal()});
  }catch(err){toast(err.message)}
}
async function applyFromPublic(id){
  try{
    await api(`/api/jobs/${id}/apply`,{method:'POST',body:JSON.stringify({})});
    closeModal();toast('Votre candidature a été envoyée au recruteur.');
  }catch(err){toast(err.message)}
}
async function loadPublicCandidates(){
  const grid=$('#publicCandidatesGrid'); if(!grid)return;
  const q=$('#candidatesSearchQ')?.value?.trim()||'', city=$('#candidatesSearchCity')?.value?.trim()||'';
  grid.innerHTML='<div class="panel">Chargement des profils…</div>';
  try{
    const d=await api(`/api/candidates?q=${encodeURIComponent(q)}&city=${encodeURIComponent(city)}`);
    $('#publicCandidatesCount').textContent=`${d.candidates.length} profil${d.candidates.length>1?'s':''} trouvé${d.candidates.length>1?'s':''}`;
    grid.innerHTML=d.candidates.length?d.candidates.map(c=>`
      <article class="candidate-market-card clickable-card" data-candidate="${c.id}" tabindex="0">
        <div class="candidate-photo">${c.photo?`<img src="${esc(c.photo)}" alt="">`:`<span>${esc(((c.first_name||'P')[0]||'P')+((c.last_name||'')[0]||''))}</span>`}</div>
        <div class="candidate-body"><span class="pill">${esc((c.plan||'standard').toUpperCase())}</span>
          <h3>${esc(`${c.first_name||''} ${c.last_name||''}`.trim()||'Professionnel')}</h3>
          <strong>${esc(c.professional_title||c.profession||'Profil professionnel')}</strong>
          <p>⌖ ${esc(c.city||c.country||'Localisation non précisée')}</p>
          <p class="card-summary">${esc((c.skills||c.specialty||'').slice(0,130))}</p>
        </div>
        <div class="candidate-card-footer"><span>${esc(c.availability||'Disponibilité à préciser')}</span>${publicActionForCandidate(c.id)}</div>
      </article>`).join(''):'<div class="panel empty-state">Aucun profil actif ne correspond à votre recherche.</div>';
    $$('.candidate-market-card').forEach(card=>{
      card.addEventListener('click',e=>{if(e.target.closest('button'))return;openCandidateDetail(Number(card.dataset.candidate))});
      card.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('button')){e.preventDefault();openCandidateDetail(Number(card.dataset.candidate))}}
    });
    $$('.public-recruit').forEach(b=>b.onclick=e=>{e.stopPropagation();recruitFromPublic(Number(b.dataset.candidate))});
    $$('.public-login-recruiter').forEach(b=>b.onclick=e=>{e.stopPropagation();loginModal()});
  }catch(err){grid.innerHTML=`<div class="panel">${esc(err.message)}</div>`}
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
    $('.public-recruit')?.addEventListener('click',()=>recruitFromPublic(id));
    $('.public-login-recruiter')?.addEventListener('click',()=>{closeModal();loginModal()});
  }catch(err){toast(err.message)}
}
async function recruitFromPublic(id){
  try{
    await api(`/api/candidates/${id}/recruit`,{method:'POST',body:JSON.stringify({message:'Je souhaite vous contacter pour une opportunité professionnelle.'})});
    closeModal();toast('Votre demande de recrutement a été envoyée au candidat.');
  }catch(err){toast(err.message)}
}
$('#jobsSearchBtn')?.addEventListener('click',loadPublicJobs);
$('#candidatesSearchBtn')?.addEventListener('click',loadPublicCandidates);
['jobsSearchQ','jobsSearchCity'].forEach(id=>$('#'+id)?.addEventListener('keydown',e=>{if(e.key==='Enter')loadPublicJobs()}));
['candidatesSearchQ','candidatesSearchCity'].forEach(id=>$('#'+id)?.addEventListener('keydown',e=>{if(e.key==='Enter')loadPublicCandidates()}));
setTimeout(()=>{loadPublicJobs();loadPublicCandidates();},250);
