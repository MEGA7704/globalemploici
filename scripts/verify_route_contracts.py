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
# V27 invariants.
if "await api('/api/data-linkage')" in app: failed.append('Frontend still blocks every page on /api/data-linkage')
fetch_pos=worker.find("if(url.pathname.startsWith('/api/')){")
if fetch_pos<0 or worker.find('await ensureRuntimeSchema(env);',fetch_pos)<0: failed.append('API fetch does not initialize V27 schema')
if 'await cleanupExpiredFreeAccounts(env);' in worker[fetch_pos:]: failed.append('Old global subscription maintenance still runs before each API request')
if 'ALTER TABLE ${qid(name)} RENAME TO ${qid(legacy)}' not in worker: failed.append('Legacy tables are not archived before canonical rebuild')
if "schema_version',?,CURRENT_TIMESTAMP" not in worker: failed.append('V27 schema version marker missing')
if 'users.id est' in worker: pass
# Ensure routes were not accidentally renamed by table names.
for bad in ['/api/recruiter/ge_jobs','/api/candidate/ge_applications','/api/recruiter/ge_applications']:
    if bad in worker: failed.append(f'Corrupted API route present: {bad}')
if failed:
    print('\n'.join('FAIL '+x for x in failed));sys.exit(1)
print(f'V27 ROUTE CONTRACTS OK ({len(required_worker)} worker routes, {len(views)} views)')
