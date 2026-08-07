PRAGMA foreign_keys = ON;

ALTER TABLE recruiter_profiles ADD COLUMN first_name TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN last_name TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN job_title TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN whatsapp TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN country TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN photo TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN trade_name TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN organization_type TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN sector TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN main_domain TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN foundation_year TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN employee_count TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN company_country TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN company_city TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN district TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN website TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN social_page TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN rccm TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN tax_id TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN cnps TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN desired_trades TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN recruitment_domains TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN annual_recruitment_count TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN contract_types TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN recruitment_zones TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN international_recruitment INTEGER DEFAULT 0;
ALTER TABLE recruiter_profiles ADD COLUMN marketing_alerts INTEGER DEFAULT 0;
ALTER TABLE recruiter_profiles ADD COLUMN verification_status TEXT DEFAULT 'unverified';
ALTER TABLE recruiter_profiles ADD COLUMN verification_note TEXT;
ALTER TABLE recruiter_profiles ADD COLUMN email_verified INTEGER DEFAULT 0;
ALTER TABLE recruiter_profiles ADD COLUMN phone_verified INTEGER DEFAULT 0;
ALTER TABLE recruiter_profiles ADD COLUMN company_info_verified INTEGER DEFAULT 0;
ALTER TABLE recruiter_profiles ADD COLUMN official_document_verified INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS recruiter_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_recruiter_documents_user ON recruiter_documents(user_id,document_type);
