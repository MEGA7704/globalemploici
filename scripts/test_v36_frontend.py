from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]/'public'
HTML=(ROOT/'index.html').read_text().replace('<script src="/app.js" defer></script>','')
JS=(ROOT/'app.js').read_text()

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1000})
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.on('dialog',lambda d:d.accept())
    page.set_content(HTML)
    page.evaluate(r'''window.__state={
      notifications:[{id:1,type:'support',title:'Support',content:'Réponse support',is_read:0,created_at:'2026-08-09T10:00:00Z'},{id:2,type:'application',title:'Candidature',content:'Mise à jour',is_read:1,created_at:'2026-08-09T09:00:00Z'}],
      apps:[{id:10,status:'submitted',job_id:5,title:'Comptable',company_name:'Entreprise',location:'Abidjan',employment_type:'CDI',salary:'300000',created_at:'2026-08-09T08:00:00Z'}],
      rr:[{id:20,recruiter_id:2,status:'sent',company_name:'Entreprise',job_title:'RH',email:'rec@test.ci',message:'Proposition',created_at:'2026-08-09T08:00:00Z'}],
      messages:[{id:30,sender_id:2,content:'Bonjour',created_at:'2026-08-09T08:00:00Z'}],
      calls:[]
    };
    window.fetch=async function(url,opts={}){
      const raw=String(url);const p=raw.replace(/([?&])_fresh=\d+(&|$)/,'$1').replace(/[?&]$/,'');const M=(opts.method||'GET').toUpperCase();window.__state.calls.push([M,p,opts.body||'']);
      const R=(o,s=200)=>({ok:s>=200&&s<300,status:s,json:async()=>o});
      if(p==='/api/session')return R({user:{id:1,email:'candidate@test.ci',role:'candidate'},subscription:{plan:'standard',effective_status:'active',expires_at:'2026-09-01T00:00:00Z'}});
      if(p==='/api/public-stats')return R({jobs:1,companies:1,candidates:1,movement:{jobs30:0,companies30:0,candidates30:0}});
      if(p==='/api/notifications'&&M==='GET')return R({notifications:window.__state.notifications});
      if(/^\/api\/notifications\/\d+\/read$/.test(p)&&M==='POST'){const id=+p.split('/')[3];window.__state.notifications.find(x=>x.id===id).is_read=1;return R({ok:true})}
      if(/^\/api\/notifications\/\d+$/.test(p)&&M==='DELETE'){const id=+p.split('/').pop();window.__state.notifications=window.__state.notifications.filter(x=>x.id!==id);return R({ok:true})}
      if(p==='/api/notifications/read-all'&&M==='POST'){window.__state.notifications.forEach(x=>x.is_read=1);return R({ok:true})}
      if(p==='/api/support/messages'&&M==='POST')return R({ok:true},201);
      if(p==='/api/conversations')return R({conversations:[{id:40,other_user_id:2,other_name:'Entreprise',other_role:'recruiter',last_message:'Bonjour'}]});
      if(p.startsWith('/api/messages?'))return R({messages:window.__state.messages});
      if(/^\/api\/messages\/\d+$/.test(p)&&M==='DELETE'){const id=+p.split('/').pop();window.__state.messages=window.__state.messages.filter(x=>x.id!==id);return R({ok:true})}
      if(p==='/api/messages'&&M==='POST')return R({ok:true,conversation_id:40},201);
      if(p==='/api/candidate/applications')return R({applications:window.__state.apps});
      if(/^\/api\/candidate\/applications\/\d+\/action$/.test(p)&&M==='POST'){const id=+p.split('/')[4],a=window.__state.apps.find(x=>x.id===id),action=JSON.parse(opts.body).action;if(action==='cancel')a.status='cancelled';if(action==='reactivate')a.status='submitted';if(action==='withdraw')window.__state.apps=window.__state.apps.filter(x=>x.id!==id);return R({ok:true,status:a?.status||'withdrawn'})}
      if(p==='/api/candidate/recruitment-requests')return R({requests:window.__state.rr});
      if(/^\/api\/candidate\/recruitment-requests\/\d+$/.test(p)&&M==='DELETE'){const id=+p.split('/').pop();window.__state.rr=window.__state.rr.filter(x=>x.id!==id);return R({ok:true})}
      if(/^\/api\/candidate\/recruitment-requests\/\d+\/status$/.test(p)&&M==='POST')return R({ok:true});
      if(p==='/api/account/delete-request'&&M==='POST')return R({ok:true,request_id:99},201);
      if(p==='/api/profile')return R({profile:{first_name:'Awa',last_name:'Kouassi'}});
      if(p==='/api/change-password')return R({ok:true});
      if(p==='/api/account/logout-all')return R({ok:true});
      return R({});
    }''')
    page.add_script_tag(content=JS)
    page.wait_for_timeout(200)

    # Notifications + support popup + persistance read/delete.
    page.evaluate("navigateView('notifications')"); page.wait_for_timeout(100)
    assert page.locator('#contactSupportFromNotifications').count()==1
    page.locator('#contactSupportFromNotifications').click(); page.wait_for_timeout(30)
    assert 'Envoyez une demande administrative au Super Admin' in page.locator('#modalBody').inner_text()
    page.locator('#closeModal').click()
    page.locator('.notification-click[data-id="1"]').click(); page.wait_for_timeout(60)
    assert any('/api/notifications/1/read' in c[1] for c in page.evaluate('window.__state.calls'))
    page.evaluate("navigateView('notifications')"); page.wait_for_timeout(60)
    assert 'unread' not in (page.locator('.notification-click[data-id="1"]').get_attribute('class') or '')
    page.locator('.notification-delete[data-id="2"]').click(); page.wait_for_timeout(60)
    assert page.locator('.notification-click[data-id="2"]').count()==0

    # Messagerie : même popup support + suppression message reçu.
    page.evaluate("navigateView('messages')"); page.wait_for_timeout(70)
    page.locator('#contactSupportFromMessages').click(); page.wait_for_timeout(30)
    assert 'Contacter le support GLOBAL EMPLOI' in page.locator('#modalBody').inner_text(); page.locator('#closeModal').click()
    page.locator('.open-conv').click(); page.wait_for_timeout(50)
    assert page.locator('.message-delete-client[data-id="30"]').count()==1
    page.locator('.message-delete-client[data-id="30"]').click(); page.wait_for_timeout(50)
    assert page.locator('.message-delete-client[data-id="30"]').count()==0
    page.locator('#closeModal').click()

    # Candidature : annuler -> réactiver/retirer.
    page.evaluate("navigateView('myapplications')"); page.wait_for_timeout(60)
    page.locator('.myapp-cancel[data-id="10"]').click(); page.wait_for_timeout(80)
    assert page.locator('.myapp-reactivate[data-id="10"]').count()==1
    assert page.locator('.myapp-withdraw[data-id="10"]').count()==1
    page.locator('.myapp-reactivate[data-id="10"]').click(); page.wait_for_timeout(80)
    assert page.locator('.myapp-cancel[data-id="10"]').count()==1

    # Abonnement actif : aucun bouton Activer mon abonnement.
    page.evaluate("navigateView('subscription')"); page.wait_for_timeout(50)
    assert page.locator('#activateBtn').count()==0
    assert 'Abonnement payant en cours' in page.locator('#viewContent').inner_text()

    # Paramètres : support déplacé, suppression = demande.
    page.evaluate("navigateView('settings')"); page.wait_for_timeout(60)
    assert 'Envoyez une demande administrative au Super Admin' not in page.locator('#viewContent').inner_text()
    page.locator('#deleteMyAccount').click(); page.wait_for_timeout(60)
    assert any('/api/account/delete-request' in c[1] for c in page.evaluate('window.__state.calls'))

    # Footer légal centré présent.
    footer=page.locator('.company-legal-footer').inner_text()
    assert 'MEGA SERVICES SARL U' in footer and 'CI-BKE-2020-B-1150' in footer and '2039493 M' in footer
    assert not errors,errors
    print('V36_FRONTEND_OK')
    browser.close()
