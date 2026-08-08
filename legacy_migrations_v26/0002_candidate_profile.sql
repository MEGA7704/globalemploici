PRAGMA foreign_keys = ON;

ALTER TABLE candidate_profiles ADD COLUMN gender TEXT;
ALTER TABLE candidate_profiles ADD COLUMN birth_date TEXT;
ALTER TABLE candidate_profiles ADD COLUMN nationality TEXT;
ALTER TABLE candidate_profiles ADD COLUMN marital_status TEXT;
ALTER TABLE candidate_profiles ADD COLUMN whatsapp TEXT;
ALTER TABLE candidate_profiles ADD COLUMN country TEXT;
ALTER TABLE candidate_profiles ADD COLUMN professional_title TEXT;
ALTER TABLE candidate_profiles ADD COLUMN activity_domain TEXT;
ALTER TABLE candidate_profiles ADD COLUMN other_skills TEXT;
ALTER TABLE candidate_profiles ADD COLUMN experience_level TEXT;
ALTER TABLE candidate_profiles ADD COLUMN current_situation TEXT;
ALTER TABLE candidate_profiles ADD COLUMN driving_license INTEGER DEFAULT 0;
ALTER TABLE candidate_profiles ADD COLUMN driving_category TEXT;
ALTER TABLE candidate_profiles ADD COLUMN education_level TEXT;
ALTER TABLE candidate_profiles ADD COLUMN target_position TEXT;
ALTER TABLE candidate_profiles ADD COLUMN target_domain TEXT;
ALTER TABLE candidate_profiles ADD COLUMN desired_contracts TEXT;
ALTER TABLE candidate_profiles ADD COLUMN desired_city TEXT;
ALTER TABLE candidate_profiles ADD COLUMN mobility TEXT;
ALTER TABLE candidate_profiles ADD COLUMN desired_salary INTEGER;
ALTER TABLE candidate_profiles ADD COLUMN accepts_travel INTEGER DEFAULT 0;
ALTER TABLE candidate_profiles ADD COLUMN job_alerts INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS candidate_education (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  diploma TEXT, specialty TEXT, institution TEXT, graduation_year TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_candidate_education_user ON candidate_education(user_id);

CREATE TABLE IF NOT EXISTS candidate_experiences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position TEXT, company TEXT, city_country TEXT, start_date TEXT, end_date TEXT,
  current_job INTEGER NOT NULL DEFAULT 0, responsibilities TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_candidate_experiences_user ON candidate_experiences(user_id);

CREATE TABLE IF NOT EXISTS candidate_languages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language TEXT NOT NULL, level TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_candidate_languages_user ON candidate_languages(user_id);

CREATE TABLE IF NOT EXISTS candidate_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_candidate_documents_user ON candidate_documents(user_id, document_type);
