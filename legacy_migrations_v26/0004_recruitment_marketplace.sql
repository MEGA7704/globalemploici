PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS recruitment_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recruiter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'sent',
  message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(recruiter_id,candidate_id)
);
CREATE INDEX IF NOT EXISTS idx_recruitment_requests_recruiter ON recruitment_requests(recruiter_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_requests_candidate ON recruitment_requests(candidate_id,created_at DESC);
