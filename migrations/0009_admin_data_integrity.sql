PRAGMA foreign_keys = ON;

-- V22 : fiabilisation des modules Super Admin.
-- Le Worker crée aussi ces éléments automatiquement pour les bases déjà déployées.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS support_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  recipient_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  subject TEXT,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'support',
  status TEXT NOT NULL DEFAULT 'unread',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO app_settings(key,value) VALUES
  ('platform_name','GLOBAL EMPLOI'),
  ('support_whatsapp','+2250777041790'),
  ('wave_payment_url','https://pay.wave.com/m/M_ci_Enx-2JNAklk-/c/ci/?amount='),
  ('standard_price','1000'),
  ('business_price','10000'),
  ('free_days','7'),
  ('standard_days','30'),
  ('business_days','365'),
  ('default_country','Côte d''Ivoire'),
  ('contact_email','');

CREATE INDEX IF NOT EXISTS idx_users_admin_role_status ON users(role,status,created_at);
CREATE INDEX IF NOT EXISTS idx_subscription_requests_admin_status ON subscription_requests(status,created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_admin_status ON jobs(status,created_at);
CREATE INDEX IF NOT EXISTS idx_applications_admin_status ON applications(status,created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_support_messages_recipient ON support_messages(recipient_user_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_messages_sender ON support_messages(sender_user_id,created_at DESC);
