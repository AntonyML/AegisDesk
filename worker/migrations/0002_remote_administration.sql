CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS organizations_name_unique
  ON organizations(name);
CREATE INDEX IF NOT EXISTS organizations_status_idx ON organizations(status);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS groups_organization_name_unique
  ON groups(organization_id, name);
CREATE INDEX IF NOT EXISTS groups_organization_idx ON groups(organization_id);

CREATE TABLE IF NOT EXISTS managed_users (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  group_id TEXT REFERENCES groups(id),
  display_name TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS managed_users_organization_idx
  ON managed_users(organization_id);
CREATE INDEX IF NOT EXISTS managed_users_group_idx ON managed_users(group_id);
CREATE INDEX IF NOT EXISTS managed_users_status_idx ON managed_users(status);

-- D1 runs migrations inside a transaction, so disabling foreign keys here is
-- not a safe way to replace a referenced parent table. Rebuild the dependent
-- graph as well and remove the old tables from the leaves to the root.
CREATE TABLE installations_new (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  equipment_name TEXT NOT NULL,
  sidc_target TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT,
  shell_version TEXT NOT NULL,
  sidc_version TEXT NOT NULL,
  last_opened_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'revoked')),
  organization_id TEXT REFERENCES organizations(id),
  group_id TEXT REFERENCES groups(id),
  assigned_user_id TEXT REFERENCES managed_users(id)
);

INSERT INTO installations_new (
  id, token_hash, equipment_name, sidc_target, created_at, updated_at,
  revoked_at, shell_version, sidc_version, last_opened_at, status
)
SELECT
  id, token_hash, equipment_name, sidc_target, created_at, created_at,
  revoked_at, shell_version, sidc_version, last_opened_at,
  CASE WHEN status = 'revoked' THEN 'revoked' ELSE 'active' END
FROM installations;

CREATE TABLE cycles_new (
  id TEXT PRIMARY KEY NOT NULL,
  installation_id TEXT NOT NULL REFERENCES installations_new(id),
  started_at TEXT NOT NULL,
  duration_months INTEGER NOT NULL CHECK (duration_months BETWEEN 2 AND 6),
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO cycles_new (
  id, installation_id, started_at, duration_months, due_at, status,
  created_by, reason, updated_at
)
SELECT
  id, installation_id, started_at, duration_months, due_at, status,
  created_by, reason, started_at
FROM cycles;

CREATE TABLE events_new (
  id TEXT PRIMARY KEY NOT NULL,
  installation_id TEXT REFERENCES installations_new(id),
  cycle_id TEXT REFERENCES cycles_new(id),
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

INSERT INTO events_new (
  id, installation_id, cycle_id, open_id, server_received_at, type, actor,
  shell_version, sidc_version, windows_user, equipment_name, consent_state,
  launch_result, payload_json
)
SELECT
  id, installation_id, cycle_id, open_id, server_received_at, type, actor,
  shell_version, sidc_version, windows_user, equipment_name, consent_state,
  launch_result, payload_json
FROM events;

DROP TABLE events;
DROP TABLE cycles;
DROP TABLE installations;

ALTER TABLE installations_new RENAME TO installations;
ALTER TABLE cycles_new RENAME TO cycles;
ALTER TABLE events_new RENAME TO events;

CREATE UNIQUE INDEX IF NOT EXISTS installations_token_hash_unique
  ON installations(token_hash);
CREATE INDEX IF NOT EXISTS installations_status_idx ON installations(status);
CREATE INDEX IF NOT EXISTS installations_last_opened_idx ON installations(last_opened_at);
CREATE INDEX IF NOT EXISTS installations_organization_idx ON installations(organization_id);
CREATE INDEX IF NOT EXISTS installations_group_idx ON installations(group_id);
CREATE INDEX IF NOT EXISTS installations_assigned_user_idx ON installations(assigned_user_id);
CREATE INDEX IF NOT EXISTS cycles_due_idx ON cycles(due_at);
CREATE INDEX IF NOT EXISTS cycles_installation_idx ON cycles(installation_id);
CREATE UNIQUE INDEX IF NOT EXISTS events_open_type_unique
  ON events(open_id, type)
  WHERE open_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_installation_time_idx
  ON events(installation_id, server_received_at);
CREATE INDEX IF NOT EXISTS events_type_time_idx
  ON events(type, server_received_at);

CREATE TABLE IF NOT EXISTS support_configs (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT REFERENCES organizations(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  notice TEXT NOT NULL DEFAULT '',
  area_name TEXT NOT NULL DEFAULT '',
  contact_email TEXT,
  contact_phone TEXT,
  hours TEXT NOT NULL DEFAULT '',
  ticket_url TEXT,
  docs_url TEXT,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS support_configs_organization_unique
  ON support_configs(organization_id)
  WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS support_configs_updated_idx ON support_configs(updated_at);
