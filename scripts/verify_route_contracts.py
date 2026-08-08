from pathlib import Path
import re, sys
root=Path(__file__).resolve().parents[1]
worker=(root/'src/_worker.js').read_text(encoding='utf-8')
app=(root/'public/app.js').read_text(encoding='utf-8')
required_worker=[
'/api/health','/api/public-stats','/api/session','/api/dashboard-metrics','/api/profile','/api/jobs','/api/candidates',
'/api/recruiter/jobs','/api/recruiter/applications','/api/candidate/applications','/api/candidate/recruitment-requests',
'/api/conversations','/api/messages','/api/notifications','/api/subscription-history','/api/support/messages',
'/api/admin/inbox','/api/admin/users','/api/admin/activation-history','/api/admin/recruiter-verifications/all',
'/api/admin/jobs','/api/admin/applications','/api/admin/audit-logs','/api/admin/messages','/api/admin/settings','/api/admin/report'
]
required_app=[p for p in required_worker if p not in {'/api/health'}]
failed=[]
for p in required_worker:
    if p not in worker: failed.append(f'Worker missing route {p}')
for p in required_app:
    if p not in app and p not in {'/api/public-stats'}: failed.append(f'Frontend missing API {p}')
views=['dashboard','profile','jobs','myjobs','applications','myapplications','recruitment','candidates','messages','notifications','subscription','payments','settings','inbox','members','activations','verifications','jobsadmin','applicationsadmin','reports','logs']
for v in views:
    if f"view==='{v}'" not in app: failed.append(f'render() missing view {v}')
# V31 invariants.
if "await api('/api/data-linkage')" in app: failed.append('Frontend still blocks every page on /api/data-linkage')
fetch_pos=worker.find("if(url.pathname.startsWith('/api/')){")
if fetch_pos<0: failed.append('API fetch branch missing')
else:
    fetch_tail=worker[fetch_pos:worker.find('assertAssetsBinding(env);',fetch_pos)]
    if 'await ensureRuntimeSchema(env);' in fetch_tail: failed.append('V31 regression: runtime schema migration still runs before API routes')
    if 'await ensureDataLinkage(env);' in fetch_tail: failed.append('V31 regression: global linkage scan still runs before API routes')
    if 'await cleanupExpiredFreeAccounts(env);' in fetch_tail: failed.append('V31 regression: subscription maintenance still runs before API routes')
# Admin page reads must not trigger global migration/linkage scans either.
admin_ready=re.search(r'async function ensureAdminDataReady\(env\)\{(.*?)\n\}',worker,re.S)
if not admin_ready: failed.append('ensureAdminDataReady missing')
elif 'ensureRuntimeSchema' in admin_ready.group(1) or 'ensureDataLinkage' in admin_ready.group(1): failed.append('Admin reads still trigger global schema/linkage work')
# Profile page must be a direct user-scoped read.
profile_get=re.search(r"if\(\(p==='/api/profile'.*?\&\&m==='GET'\)\{(.*?)if\(\(p==='/api/profile'",worker,re.S)
if profile_get and 'ensureDataLinkage(env)' in profile_get.group(1): failed.append('Profile read still triggers global linkage scan')
# Ensure routes were not accidentally renamed by table names.
for bad in ['/api/recruiter/ge_jobs','/api/candidate/ge_applications','/api/recruiter/ge_applications']:
    if bad in worker: failed.append(f'Corrupted API route present: {bad}')
if failed:
    print('\n'.join('FAIL '+x for x in failed));sys.exit(1)
print(f'V31 ROUTE CONTRACTS OK ({len(required_worker)} worker routes, {len(views)} views)')
