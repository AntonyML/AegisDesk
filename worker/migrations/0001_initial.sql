CREATE TABLE IF NOT EXISTS installations (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  equipment_name TEXT NOT NULL,
  sidc_target TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  shell_version TEXT NOT NULL,
  sidc_version TEXT NOT NULL,
  last_opened_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked'))
);

CREATE TABLE IF NOT EXISTS enrollment_codes (
  id TEXT PRIMARY KEY NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cycles (
  id TEXT PRIMARY KEY NOT NULL,
  installation_id TEXT NOT NULL REFERENCES installations(id),
  started_at TEXT NOT NULL,
  duration_months INTEGER NOT NULL CHECK (duration_months BETWEEN 2 AND 6),
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_by TEXT NOT NULL,
  reason TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY NOT NULL,
  installation_id TEXT REFERENCES installations(id),
  cycle_id TEXT REFERENCES cycles(id),
  open_id TEXT,
  server_received_at TEXT NOT NULL,
  type TEXT NOT NULL,
  actor TEXT,
  shell_version TEXT,
  sidc_version TEXT,
  windows_user TEXT,
  equipment_name TEXT,
  consent_state TEXT,
  launch_result TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  team TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'spam')),
  notified INTEGER NOT NULL DEFAULT 0,
  notified_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS events_open_type_unique
  ON events (open_id, type)
  WHERE open_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS installations_status_idx ON installations(status);
CREATE INDEX IF NOT EXISTS installations_last_opened_idx ON installations(last_opened_at);
CREATE INDEX IF NOT EXISTS enrollment_codes_expires_idx ON enrollment_codes(expires_at);
CREATE INDEX IF NOT EXISTS cycles_due_idx ON cycles(due_at);
CREATE INDEX IF NOT EXISTS events_installation_time_idx ON events(installation_id, server_received_at);
CREATE INDEX IF NOT EXISTS events_type_time_idx ON events(type, server_received_at);
CREATE INDEX IF NOT EXISTS tickets_status_time_idx ON tickets(status, created_at);
