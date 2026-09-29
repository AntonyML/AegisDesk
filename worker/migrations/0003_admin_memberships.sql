CREATE TABLE IF NOT EXISTS admin_memberships (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  organization_id TEXT REFERENCES organizations(id),
  role TEXT NOT NULL CHECK (role IN ('platform_owner', 'org_admin', 'org_viewer')),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  UNIQUE(email, organization_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_memberships_platform_idx
  ON admin_memberships(email)
  WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS admin_memberships_email_idx
  ON admin_memberships(email);

CREATE INDEX IF NOT EXISTS admin_memberships_org_idx
  ON admin_memberships(organization_id);

ALTER TABLE tickets ADD COLUMN organization_id TEXT REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS tickets_organization_idx ON tickets(organization_id);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
