CREATE TABLE IF NOT EXISTS terms_acceptances (
  id TEXT PRIMARY KEY NOT NULL,
  installation_id TEXT NOT NULL REFERENCES installations(id),
  terms_version TEXT NOT NULL,
  terms_sha256 TEXT NOT NULL,
  accepted_at_client TEXT NOT NULL,
  received_at TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('installer', 'first-run', 'reacceptance')),
  shell_version TEXT NOT NULL,
  UNIQUE(installation_id, terms_version)
);

CREATE INDEX IF NOT EXISTS terms_acceptances_installation_idx
  ON terms_acceptances(installation_id);
