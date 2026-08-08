PRAGMA foreign_keys = ON;

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

CREATE INDEX IF NOT EXISTS idx_support_messages_recipient
ON support_messages(recipient_user_id,status,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_messages_sender
ON support_messages(sender_user_id,created_at DESC);
