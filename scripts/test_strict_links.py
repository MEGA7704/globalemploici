import sqlite3, pathlib, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
con=sqlite3.connect(':memory:')
con.row_factory=sqlite3.Row
# Apply through 0010 first so we can reproduce legacy broken links before 0011.
for f in sorted((ROOT/'migrations').glob('*.sql')):
    if f.name >= '0011_':
        continue
    con.executescript(f.read_text())
# Add runtime-only job columns referenced by the worker.
have={r['name'] for r in con.execute('PRAGMA table_info(jobs)')}
for name,typ in {
 'education_required':'TEXT','experience_required':'TEXT','skills_required':'TEXT','responsibilities':'TEXT',
 'candidate_profile':'TEXT','work_schedule':'TEXT','availability_required':'TEXT','view_count':'INTEGER DEFAULT 0'
}.items():
    if name not in have: con.execute(f'ALTER TABLE jobs ADD COLUMN {name} {typ}')
# IDs chosen so profile.id=1 wrongly points to admin user id=1, while profile.user_id is correct business user.
con.execute("INSERT INTO users(id,email,password_hash,password_salt,role,status) VALUES(1,'admin@x','h','s','super_admin','active')")
con.execute("INSERT INTO users(id,email,password_hash,password_salt,role,status) VALUES(10,'cand@x','h','s','candidate','active')")
con.execute("INSERT INTO users(id,email,password_hash,password_salt,role,status) VALUES(20,'rec@x','h','s','recruiter','active')")
con.execute("INSERT INTO candidate_profiles(id,user_id,first_name,last_name) VALUES(1,10,'Awa','Test')")
con.execute("INSERT INTO recruiter_profiles(id,user_id,first_name,last_name,company_name) VALUES(1,20,'Paul','Test','Entreprise')")
con.execute("INSERT INTO subscriptions(user_id,plan,started_at,expires_at,status) VALUES(10,'free','2026-01-01','2099-12-31','active')")
con.execute("INSERT INTO subscriptions(user_id,plan,started_at,expires_at,status) VALUES(20,'standard','2026-08-01','2026-09-01','active')")
# Temporarily disable FK enforcement to reproduce data written by a buggy/legacy version.
con.execute('PRAGMA foreign_keys=OFF')
con.execute("INSERT INTO jobs(id,recruiter_id,title,description,status) VALUES(100,1,'Offre cassée','Test','published')")
con.execute("INSERT INTO applications(id,job_id,candidate_id,status) VALUES(200,100,1,'submitted')")
con.execute("INSERT INTO recruitment_requests(id,recruiter_id,candidate_id,status) VALUES(300,1,1,'sent')")
con.commit()
# Apply V26 repair.
con.executescript((ROOT/'migrations/0011_strict_user_data_links.sql').read_text())
job=con.execute('SELECT recruiter_id FROM jobs WHERE id=100').fetchone()['recruiter_id']
app=con.execute('SELECT candidate_id FROM applications WHERE id=200').fetchone()['candidate_id']
rr=con.execute('SELECT recruiter_id,candidate_id FROM recruitment_requests WHERE id=300').fetchone()
assert job==20, job
assert app==10, app
assert rr['recruiter_id']==20 and rr['candidate_id']==10, dict(rr)
# Verify the exact role pages now see the repaired records.
assert con.execute('SELECT COUNT(*) n FROM jobs WHERE recruiter_id=20').fetchone()['n']==1
assert con.execute('SELECT COUNT(*) n FROM applications a JOIN jobs j ON j.id=a.job_id WHERE j.recruiter_id=20').fetchone()['n']==1
assert con.execute('SELECT COUNT(*) n FROM applications WHERE candidate_id=10').fetchone()['n']==1
assert con.execute('SELECT COUNT(*) n FROM recruitment_requests WHERE candidate_id=10').fetchone()['n']==1
assert con.execute('SELECT COUNT(*) n FROM recruitment_requests WHERE recruiter_id=20').fetchone()['n']==1
print('STRICT LINK REPAIR OK: jobs/applications/recruitment_requests -> users.id')
