-- GLOBAL EMPLOI V27 deployment marker.
-- The Worker performs the one-time V26 archive/import before writing schema_version=27.0.0.
-- Do NOT set schema_version here, otherwise the automatic rebuild would be skipped.
CREATE TABLE IF NOT EXISTS v27_system_meta(
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO v27_system_meta(key,value,updated_at)
VALUES('deployment_package','V27',CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value='V27',updated_at=CURRENT_TIMESTAMP;
