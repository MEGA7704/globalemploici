import sqlite3, pathlib, json, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
con=sqlite3.connect(':memory:')
con.row_factory=sqlite3.Row
con.execute('PRAGMA foreign_keys=ON')
for f in sorted((ROOT/'migrations').glob('*.sql')):
    con.executescript(f.read_text())

# Reproduit les colonnes ajoutées automatiquement par ensureRecruiterProSchema().
job_cols={
    'education_required':'TEXT','experience_required':'TEXT','skills_required':'TEXT','responsibilities':'TEXT',
    'candidate_profile':'TEXT','work_schedule':'TEXT','availability_required':'TEXT','view_count':'INTEGER DEFAULT 0'
}
have={r['name'] for r in con.execute('PRAGMA table_info(jobs)')}
for name,typ in job_cols.items():
    if name not in have:
        con.execute(f'ALTER TABLE jobs ADD COLUMN {name} {typ}')

# Données représentatives : admin, candidat auto-désactivé par ancien code, recruteur payant, candidat désactivé manuellement.
users=[
 ('admin@test.local','0700000000','h','s','super_admin','active'),
 ('candidate@test.local','0711111111','h','s','candidate','disabled'),
 ('recruiter@test.local','0722222222','h','s','recruiter','active'),
 ('manual-disabled@test.local','0733333333','h','s','candidate','disabled'),
]
for row in users:
    con.execute("INSERT INTO users(email,phone,password_hash,password_salt,role,status) VALUES(?,?,?,?,?,?)",row)
admin,candidate,recruiter,manual=[r['id'] for r in con.execute('SELECT id FROM users ORDER BY id')]
con.execute("INSERT INTO candidate_profiles(user_id,first_name,last_name,profession,city,country,skills,availability,professional_title,experience_level,education_level) VALUES(?,?,?,?,?,?,?,?,?,?,?)",(candidate,'Awa','Kouassi','Comptable','Bouaké',"Côte d'Ivoire",'Excel, gestion','Disponible','Comptable','3 ans','Bac+3'))
con.execute("INSERT INTO candidate_profiles(user_id,first_name,last_name,profession,city,country) VALUES(?,?,?,?,?,?)",(manual,'Manuel','Bloqué','Agent','Abidjan',"Côte d'Ivoire"))
con.execute("INSERT INTO recruiter_profiles(user_id,first_name,last_name,job_title,company_name,organization_type,sector,main_domain,company_city,company_country,verification_status) VALUES(?,?,?,?,?,?,?,?,?,?,?)",(recruiter,'Paul','Yao','RH','Société Test','SARL','Services','Informatique','Abidjan',"Côte d'Ivoire",'pending'))
# FREE expiré du candidat : doit être réparé sans bloquer la session.
con.execute("INSERT INTO subscriptions(user_id,plan,started_at,expires_at,status) VALUES(?, 'free','2026-07-01','2026-07-08','expired')",(candidate,))
# Recruteur payant actif + ancien free expiré.
con.execute("INSERT INTO subscriptions(user_id,plan,started_at,expires_at,status) VALUES(?, 'free','2026-06-01','2026-06-08','expired')",(recruiter,))
con.execute("INSERT INTO subscriptions(user_id,plan,started_at,expires_at,status) VALUES(?, 'standard','2026-08-01','2026-09-01','active')",(recruiter,))
con.execute("INSERT INTO subscriptions(user_id,plan,started_at,expires_at,status) VALUES(?, 'free','2026-07-01','2026-07-08','expired')",(manual,))
con.execute("INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES(?, 'USER_STATUS_CHANGED','user',?,?)",(admin,str(manual),json.dumps({'status':'disabled'},separators=(',',':'))))
con.execute("INSERT INTO subscription_requests(user_id,plan,amount,payer_phone,transaction_id,status) VALUES(?, 'standard',1000,'0711111111','TX-001','pending')",(candidate,))
con.execute("INSERT INTO jobs(recruiter_id,title,profession,category,description,employment_type,location,status,view_count) VALUES(?,?,?,?,?,?,?,?,?)",(recruiter,'Développeur Web','Développeur','Informatique','Offre de test','CDI','Abidjan','published',12))
job=con.execute('SELECT id FROM jobs').fetchone()['id']
con.execute("INSERT INTO applications(job_id,candidate_id,status,message) VALUES(?,?, 'submitted','Je suis intéressée')",(job,candidate))
con.execute("INSERT INTO recruitment_requests(recruiter_id,candidate_id,status,message) VALUES(?,?, 'sent','Contact test')",(recruiter,candidate))
con.execute("INSERT INTO notifications(user_id,type,title,content) VALUES(?, 'application','Test','Notification test')",(candidate,))
con.execute("INSERT INTO support_messages(sender_user_id,recipient_user_id,subject,content,category,status) VALUES(?,?,?,?,?,?)",(candidate,admin,'Aide','Message support','support','unread'))
con.execute("INSERT INTO conversations DEFAULT VALUES")
cid=con.execute('SELECT id FROM conversations').fetchone()['id']
con.execute('INSERT INTO conversation_members(conversation_id,user_id) VALUES(?,?)',(cid,candidate))
con.execute('INSERT INTO conversation_members(conversation_id,user_id) VALUES(?,?)',(cid,recruiter))
con.execute("INSERT INTO messages(conversation_id,sender_id,content) VALUES(?,?,?)",(cid,candidate,'Bonjour recruteur'))
con.execute("INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES(?, 'LOGIN','user',?,?)",(candidate,str(candidate),'{}'))
con.commit()

# Rejoue la migration corrective V24 comme le ferait la réparation runtime.
con.executescript((ROOT/'migrations/0010_runtime_schema_and_free_access.sql').read_text())

checks=[]
def check(name, sql, params=(), min_rows=1):
    rows=con.execute(sql,params).fetchall()
    ok=len(rows)>=min_rows
    checks.append((name,ok,len(rows)))
    if not ok:
        print('FAIL',name,'rows=',len(rows))
    else:
        print('OK  ',name,'rows=',len(rows))
    return rows

# Session / abonnement courant : candidat auto-désactivé redevient actif; manuel reste désactivé.
row=con.execute('SELECT status FROM users WHERE id=?',(candidate,)).fetchone(); assert row['status']=='active', row['status']
row=con.execute('SELECT status FROM users WHERE id=?',(manual,)).fetchone(); assert row['status']=='disabled', row['status']
cur=con.execute("""SELECT * FROM subscriptions WHERE user_id=? ORDER BY CASE WHEN status='active' AND plan IN ('standard','business') AND datetime(expires_at)>datetime('now') THEN 0 WHEN status='active' AND plan='free' THEN 1 ELSE 2 END,id DESC LIMIT 1""",(recruiter,)).fetchone(); assert cur['plan']=='standard', dict(cur)
cur=con.execute("""SELECT * FROM subscriptions WHERE user_id=? ORDER BY CASE WHEN status='active' AND plan IN ('standard','business') AND datetime(expires_at)>datetime('now') THEN 0 WHEN status='active' AND plan='free' THEN 1 ELSE 2 END,id DESC LIMIT 1""",(candidate,)).fetchone(); assert cur['plan']=='free' and cur['status']=='active', dict(cur)
print('OK   session/free-access repair')

# ADMIN : pages demandées.
check('Admin - Demandes & inscriptions', """SELECT u.id,u.email,u.phone,u.role,u.status,u.created_at,u.last_login_at,s.plan,s.expires_at,s.status subscription_status FROM users u LEFT JOIN subscriptions s ON s.id=(SELECT id FROM subscriptions WHERE user_id=u.id ORDER BY id DESC LIMIT 1) WHERE u.role IN ('candidate','recruiter') ORDER BY u.id DESC""", min_rows=3)
check('Admin - Membres inscrits', """SELECT u.id,u.email,u.phone,u.role,u.status,u.created_at,u.last_login_at,s.plan,s.expires_at,s.status subscription_status,cp.first_name candidate_first_name,cp.last_name candidate_last_name,rp.first_name recruiter_first_name,rp.last_name recruiter_last_name,rp.company_name FROM users u LEFT JOIN subscriptions s ON s.id=(SELECT id FROM subscriptions WHERE user_id=u.id ORDER BY datetime(expires_at) DESC,id DESC LIMIT 1) LEFT JOIN candidate_profiles cp ON cp.user_id=u.id LEFT JOIN recruiter_profiles rp ON rp.user_id=u.id ORDER BY u.id DESC""", min_rows=4)
check('Admin - Activations', """SELECT sr.*,COALESCE(u.email,'Compte supprimé #'||sr.user_id) email,COALESCE(u.role,'unknown') role,a.email admin_email FROM subscription_requests sr LEFT JOIN users u ON u.id=sr.user_id LEFT JOIN users a ON a.id=sr.admin_id WHERE (?='' OR sr.status=?) ORDER BY sr.id DESC""",('pending','pending'))
check('Admin - Vérifications recruteurs', """SELECT r.user_id,r.first_name,r.last_name,r.job_title,r.company_name,r.organization_type,r.sector,r.company_city,r.verification_status,r.verification_note,r.updated_at,u.email,u.phone FROM recruiter_profiles r LEFT JOIN users u ON u.id=r.user_id ORDER BY CASE r.verification_status WHEN 'pending' THEN 0 WHEN 'unverified' THEN 1 ELSE 2 END,r.updated_at DESC""")
check('Admin - Toutes les offres', """SELECT j.*,COALESCE(u.email,'Compte #'||j.recruiter_id) recruiter_email,r.company_name,COALESCE(u.status,'deleted') recruiter_status,(SELECT COUNT(*) FROM applications a WHERE a.job_id=j.id) application_count FROM jobs j LEFT JOIN users u ON u.id=j.recruiter_id LEFT JOIN recruiter_profiles r ON r.user_id=j.recruiter_id ORDER BY j.id DESC""")
check('Admin - Candidatures', """SELECT a.id,a.job_id,a.candidate_id,a.status,a.created_at,COALESCE(j.title,'Offre #'||a.job_id) title,COALESCE(cu.email,'Compte #'||a.candidate_id) candidate_email,COALESCE(ru.email,'Compte recruteur') recruiter_email,r.company_name FROM applications a LEFT JOIN jobs j ON j.id=a.job_id LEFT JOIN users cu ON cu.id=a.candidate_id LEFT JOIN users ru ON ru.id=j.recruiter_id LEFT JOIN recruiter_profiles r ON r.user_id=ru.id ORDER BY a.id DESC""")
check('Admin - Journal activité', """SELECT a.*,COALESCE(u.email,CASE WHEN a.actor_user_id IS NULL THEN 'Système' ELSE 'Compte #'||a.actor_user_id END) actor_email FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.id DESC""",min_rows=2)
check('Admin - Messages support', """SELECT sm.*,su.email sender_email,ru.email recipient_email FROM support_messages sm LEFT JOIN users su ON su.id=sm.sender_user_id LEFT JOIN users ru ON ru.id=sm.recipient_user_id ORDER BY sm.id DESC""")
check('Admin - Messages privés', """SELECT m.id,m.conversation_id,m.sender_id,m.content,m.read_at,m.created_at,COALESCE(su.email,'Compte #'||m.sender_id) sender_email,GROUP_CONCAT(CASE WHEN cm.user_id<>m.sender_id THEN COALESCE(ou.email,'Compte #'||cm.user_id) END, ', ') recipient_emails FROM messages m LEFT JOIN users su ON su.id=m.sender_id LEFT JOIN conversation_members cm ON cm.conversation_id=m.conversation_id LEFT JOIN users ou ON ou.id=cm.user_id GROUP BY m.id,m.conversation_id,m.sender_id,m.content,m.read_at,m.created_at,su.email ORDER BY m.id DESC""")
check('Admin - Paramètres', 'SELECT key,value FROM app_settings', min_rows=5)

# DEMANDEUR : tableaux et pages données.
check('Demandeur - Profil', 'SELECT * FROM candidate_profiles WHERE user_id=?',(candidate,))
check('Demandeur - Dashboard candidatures', 'SELECT id FROM applications WHERE candidate_id=?',(candidate,))
check('Demandeur - Mes candidatures', """SELECT a.id,a.status,a.message,a.created_at,a.updated_at,j.id job_id,j.title,j.location,j.employment_type,j.salary,r.company_name FROM applications a JOIN jobs j ON j.id=a.job_id LEFT JOIN recruiter_profiles r ON r.user_id=j.recruiter_id WHERE a.candidate_id=? ORDER BY a.id DESC""",(candidate,))
check('Demandeur - Propositions reçues', """SELECT rr.*,r.company_name,r.trade_name,r.job_title,u.email FROM recruitment_requests rr JOIN users u ON u.id=rr.recruiter_id LEFT JOIN recruiter_profiles r ON r.user_id=rr.recruiter_id WHERE rr.candidate_id=? ORDER BY rr.id DESC""",(candidate,))
check('Demandeur - Notifications', 'SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100',(candidate,))
check('Demandeur - Messages', """SELECT c.id,c.updated_at,(SELECT content FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) last_message,ou.id other_user_id,ou.email other_email,ou.role other_role,COALESCE(cp.first_name||' '||cp.last_name,rp.company_name,ou.email) other_name FROM conversations c JOIN conversation_members me ON me.conversation_id=c.id AND me.user_id=? JOIN conversation_members other ON other.conversation_id=c.id AND other.user_id<>? JOIN users ou ON ou.id=other.user_id LEFT JOIN candidate_profiles cp ON cp.user_id=ou.id LEFT JOIN recruiter_profiles rp ON rp.user_id=ou.id ORDER BY c.updated_at DESC""",(candidate,candidate))

# RECRUTEUR : tableaux et pages données.
check('Recruteur - Profil', 'SELECT * FROM recruiter_profiles WHERE user_id=?',(recruiter,))
check('Recruteur - Mes offres', """SELECT j.*,(SELECT COUNT(*) FROM applications a WHERE a.job_id=j.id) application_count,CASE WHEN EXISTS(SELECT 1 FROM subscriptions sub WHERE sub.user_id=j.recruiter_id AND sub.status='active' AND sub.plan IN ('standard','business') AND datetime(sub.expires_at)>datetime('now')) AND j.status='published' THEN 1 ELSE 0 END public_visible FROM jobs j WHERE j.recruiter_id=? ORDER BY j.id DESC""",(recruiter,))
check('Recruteur - Candidatures reçues', """SELECT a.id,a.status,a.message,a.created_at,j.id job_id,j.title,u.id candidate_id,u.email,u.phone,p.first_name,p.last_name,p.profession,p.professional_title,p.specialty,p.city,p.country,p.experience_level,p.experience_years,p.skills,p.description,p.availability,p.target_position,p.desired_contracts FROM applications a JOIN jobs j ON j.id=a.job_id JOIN users u ON u.id=a.candidate_id LEFT JOIN candidate_profiles p ON p.user_id=a.candidate_id WHERE j.recruiter_id=? ORDER BY a.id DESC""",(recruiter,))
check('Recruteur - Messages', """SELECT c.id,c.updated_at,(SELECT content FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) last_message,ou.id other_user_id,ou.email other_email,ou.role other_role,COALESCE(cp.first_name||' '||cp.last_name,rp.company_name,ou.email) other_name FROM conversations c JOIN conversation_members me ON me.conversation_id=c.id AND me.user_id=? JOIN conversation_members other ON other.conversation_id=c.id AND other.user_id<>? JOIN users ou ON ou.id=other.user_id LEFT JOIN candidate_profiles cp ON cp.user_id=ou.id LEFT JOIN recruiter_profiles rp ON rp.user_id=ou.id ORDER BY c.updated_at DESC""",(recruiter,recruiter))

if not all(ok for _,ok,_ in checks):
    sys.exit(1)
print(f'ALL PAGE DATA SMOKE TESTS OK ({len(checks)} checks)')
