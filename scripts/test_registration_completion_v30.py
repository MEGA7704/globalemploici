from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]/'public'
HTML=(ROOT/'index.html').read_text().replace('<script src="/app.js" defer></script>','')
JS=(ROOT/'app.js').read_text()
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1280,'height':900})
    errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(HTML)
    page.evaluate("""window.__registered=false; window.fetch=async function(url,opts){
      const p=String(url); const R=(o,s=200)=>({ok:s>=200&&s<300,status:s,json:async()=>o});
      if(p.startsWith('/api/register')){ window.__registered=true; return R({ok:true,user:{id:7,email:'x@test.ci',role:'candidate'},subscription:{plan:'free'}},201); }
      if(p.startsWith('/api/session') && window.__registered) return new Promise(resolve=>setTimeout(()=>resolve(R({user:{id:7,email:'x@test.ci',role:'candidate'},subscription:{plan:'free'}})),2000)); // simulate slow post-register session
      if(p.startsWith('/api/session')) return R({error:'Non authentifié'},401);
      if(p.startsWith('/api/public-stats')) return R({jobs:0,companies:0,candidates:0,movement:{}});
      return R({});
    }""")
    page.add_script_tag(content=JS); page.wait_for_timeout(100)
    page.locator('#registerBtn').click(); page.wait_for_timeout(20)
    f=page.locator('#registerForm')
    f.locator('input[name="last_name"]').fill('Kouassi')
    f.locator('input[name="first_name"]').fill('Awa')
    f.locator('input[name="birth_date"]').fill('2000-01-01')
    f.locator('input[name="city"]').fill('Bouaké')
    f.locator('input[name="phone"]').fill('0102030405')
    f.locator('input[name="email"]').fill('v30@test.ci')
    f.locator('input[name="password"]').fill('Candidate!123')
    f.locator('input[name="terms"]').check()
    page.locator('#registerSubmit').click(); page.wait_for_timeout(150)
    assert page.evaluate('window.__registered') is True
    assert 'hidden' in (page.locator('#modal').get_attribute('class') or ''), 'registration modal must close immediately after 201'
    assert 'Compte créé' in page.locator('#toast').inner_text()
    assert not errors, errors
    print('V30_REGISTRATION_COMPLETION_OK')
    browser.close()
