from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]/'public'
HTML=(ROOT/'index.html').read_text().replace('<script src="/app.js" defer></script>','')
JS=(ROOT/'app.js').read_text()

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1000})
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(HTML)
    page.evaluate("""window.fetch=async function(url,opts){
      const p=String(url); const R=(o,s=200)=>({ok:s>=200&&s<300,status:s,json:async()=>o});
      if(p.startsWith('/api/session')) return R({error:'Non authentifié'},401);
      if(p.startsWith('/api/public-stats')) return R({jobs:2,companies:1,candidates:1,movement:{jobs30:1,companies30:1,candidates30:1}});
      if(p.startsWith('/api/jobs?')) return R({jobs:[{id:1,title:'Comptable',company_name:'Entreprise Test',location:'Abidjan',employment_type:'CDI',category:'Finance',description:'Test',created_at:'2026-08-08T10:00:00Z'}],pagination:{page:1,pages:1,total:1}});
      if(p.startsWith('/api/candidates?')) return R({candidates:[{id:2,first_name:'Jean',last_name:'Test',professional_title:'Comptable',city:'Abidjan',skills:'Comptabilité'}],pagination:{page:1,pages:1,total:1}});
      if(p.startsWith('/api/jobs/1')) return R({job:{id:1,title:'Comptable',company_name:'Entreprise Test',location:'Abidjan',employment_type:'CDI',description:'Description test'}});
      if(p.startsWith('/api/candidates/2')) return R({candidate:{id:2,first_name:'Jean',last_name:'Test',professional_title:'Comptable',city:'Abidjan'},experiences:[],education:[],languages:[]});
      if(p.startsWith('/api/register')) return R({ok:true},201);
      return R({});
    }""")
    page.evaluate("location.hash='#jobs'")
    page.add_script_tag(content=JS)
    page.wait_for_timeout(400)

    def hidden(sel):
        return 'public-page-hidden' in (page.locator(sel).get_attribute('class') or '')

    assert not hidden('#jobs')
    assert hidden('#candidates')

    page.locator('#jobsSearchBtn').click(); page.wait_for_timeout(80)
    assert 'Comptable' in page.locator('#publicJobsGrid').inner_text()
    page.locator('.public-job-detail').click(); page.wait_for_timeout(50)
    assert 'Description test' in page.locator('#modalBody').inner_text()
    page.locator('#closeModal').click()

    page.locator('#publicJobsGrid .public-register-candidate').click(); page.wait_for_timeout(50)
    assert page.locator('#registerForm').count()==1
    assert page.locator('#registerForm input[name="birth_date"]').count()==1
    page.locator('#closeModal').click()

    page.locator('#registerBtn').click(); page.wait_for_timeout(50)
    assert page.locator('#registerForm').count()==1
    page.locator('[data-register-role="recruiter"]').click(); page.wait_for_timeout(50)
    assert page.locator('#registerForm input[name="job_title"]').count()==1
    page.locator('#closeModal').click()

    page.locator('#loginBtn').click(); page.wait_for_timeout(50)
    assert page.locator('#loginForm').count()==1
    page.locator('#closeModal').click()

    page.locator('[data-public-page="candidates"]').click(); page.wait_for_timeout(80)
    assert not hidden('#candidates')
    page.locator('#candidatesSearchBtn').click(); page.wait_for_timeout(80)
    assert 'Jean Test' in page.locator('#publicCandidatesGrid').inner_text()
    page.locator('.public-candidate-detail').click(); page.wait_for_timeout(50)
    assert 'Jean Test' in page.locator('#modalBody').inner_text()
    page.locator('#closeModal').click()
    page.locator('#publicCandidatesGrid .public-register-recruiter').click(); page.wait_for_timeout(50)
    assert page.locator('#registerForm input[name="job_title"]').count()==1

    assert not errors, errors
    print('V28_PUBLIC_BUTTONS_OK')
    browser.close()
