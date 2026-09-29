PRAGMA foreign_keys=OFF;

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

DROP TABLE installations;
ALTER TABLE installations_new RENAME TO installations;

CREATE UNIQUE INDEX IF NOT EXISTS installations_token_hash_unique
  ON installations(token_hash);
CREATE INDEX IF NOT EXISTS installations_status_idx ON installations(status);
CREATE INDEX IF NOT EXISTS installations_last_opened_idx ON installations(last_opened_at);
CREATE INDEX IF NOT EXISTS installations_organization_idx ON installations(organization_id);
CREATE INDEX IF NOT EXISTS installations_group_idx ON installations(group_id);
CREATE INDEX IF NOT EXISTS installations_assigned_user_idx ON installations(assigned_user_id);

ALTER TABLE cycles ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
UPDATE cycles SET updated_at = started_at WHERE updated_at = '1970-01-01T00:00:00.000Z';

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

PRAGMA foreign_keys=ON;
