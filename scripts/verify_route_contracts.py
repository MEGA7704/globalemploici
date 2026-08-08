from pathlib import Path
import sys
root=Path(__file__).resolve().parents[1]
worker=(root/'src/_worker.js').read_text()
app=(root/'public/app.js').read_text()
required={
 'session':'/api/session',
 'dashboard':'/api/dashboard-metrics',
 'profile':'/api/profile',
 'recruiter jobs':'/api/recruiter/jobs',
 'recruiter applications':'/api/recruiter/applications',
 'candidate applications':'/api/candidate/applications',
 'candidate recruitment':'/api/candidate/recruitment-requests',
 'conversations':'/api/conversations',
 'notifications':'/api/notifications',
 'admin inbox':'/api/admin/inbox',
 'admin users':'/api/admin/users',
 'admin activations':'/api/admin/activation-history',
 'admin verifications':'/api/admin/recruiter-verifications/all',
 'admin jobs':'/api/admin/jobs',
 'admin applications':'/api/admin/applications',
 'admin audit':'/api/admin/audit-logs',
 'admin messages':'/api/admin/messages',
 'admin settings':'/api/admin/settings',
}
failed=[]
for name,path in required.items():
    if path not in worker:
        failed.append(f'Worker missing {name}: {path}')
    if path not in app and name not in {'session','dashboard'}:
        # session/dashboard are also checked separately below and are direct app calls.
        failed.append(f'Frontend missing {name}: {path}')
for token in ['/api/session','/api/dashboard-metrics']:
    if token not in app: failed.append(f'Frontend missing {token}')
# Every connected menu view must be handled by render().
views=['dashboard','profile','jobs','myjobs','applications','myapplications','recruitment','candidates','messages','notifications','subscription','payments','settings','inbox','members','activations','verifications','jobsadmin','applicationsadmin','reports','logs']
for v in views:
    if f"view==='{v}'" not in app:
        failed.append(f'render() missing view {v}')
# V24 startup order and old automatic disable guard.
fetch_block=worker[worker.index("if(url.pathname.startsWith('/api/')){"):]
if fetch_block.find('ensureRuntimeSchema(env)')>fetch_block.find('cleanupExpiredFreeAccounts(env)'):
    failed.append('runtime schema is not initialized before maintenance')
if "UPDATE users SET status='disabled'" in worker:
    failed.append('old automatic FREE user disable still present')
if 'Votre accès FREE est limité à 7 jours' in app:
    failed.append('old 7-day FREE blocking popup still present')
if failed:
    print('\n'.join('FAIL '+x for x in failed)); sys.exit(1)
print(f'ROUTE CONTRACTS OK ({len(required)} API contracts, {len(views)} views)')
