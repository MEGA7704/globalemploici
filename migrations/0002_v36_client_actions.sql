-- GLOBAL EMPLOI V36 — préférences de masquage côté client.
-- Les données sources restent conservées pour l'expéditeur et l'administration.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS user_hidden_items(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,item_type,item_id)
);
CREATE INDEX IF NOT EXISTS v36_idx_hidden_user_type
  ON user_hidden_items(user_id,item_type,item_id);
