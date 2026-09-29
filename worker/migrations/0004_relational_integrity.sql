-- Reconcile existing inconsistent managed_users
UPDATE managed_users
SET group_id = NULL
WHERE group_id IS NOT NULL AND organization_id != (
  SELECT organization_id FROM groups WHERE groups.id = managed_users.group_id
);

-- Reconcile existing inconsistent installations: group organization mismatch
UPDATE installations
SET group_id = NULL
WHERE group_id IS NOT NULL AND (
  organization_id IS NULL OR
  organization_id != (SELECT organization_id FROM groups WHERE groups.id = installations.group_id)
);

-- Reconcile existing inconsistent installations: user organization mismatch
UPDATE installations
SET assigned_user_id = NULL
WHERE assigned_user_id IS NOT NULL AND (
  organization_id IS NULL OR
  organization_id != (SELECT organization_id FROM managed_users WHERE managed_users.id = installations.assigned_user_id)
);

-- Reconcile existing inconsistent installations: group/user mismatch
UPDATE installations
SET assigned_user_id = NULL
WHERE group_id IS NOT NULL AND assigned_user_id IS NOT NULL AND (
  SELECT group_id FROM managed_users WHERE managed_users.id = installations.assigned_user_id
) IS NOT NULL AND (
  SELECT group_id FROM managed_users WHERE managed_users.id = installations.assigned_user_id
) != installations.group_id;

-- Triggers for managed_users
CREATE TRIGGER IF NOT EXISTS trg_managed_users_org_insert
BEFORE INSERT ON managed_users
FOR EACH ROW
WHEN NEW.group_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'assignment_organization_mismatch')
  WHERE (SELECT organization_id FROM groups WHERE id = NEW.group_id) != NEW.organization_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_managed_users_org_update
BEFORE UPDATE OF organization_id, group_id ON managed_users
FOR EACH ROW
WHEN NEW.group_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'assignment_organization_mismatch')
  WHERE (SELECT organization_id FROM groups WHERE id = NEW.group_id) != NEW.organization_id;
END;

-- Triggers for installations
CREATE TRIGGER IF NOT EXISTS trg_installations_org_insert
BEFORE INSERT ON installations
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'assignment_organization_mismatch')
  WHERE NEW.group_id IS NOT NULL AND (
    NEW.organization_id IS NULL OR
    (SELECT organization_id FROM groups WHERE id = NEW.group_id) != NEW.organization_id
  );

  SELECT RAISE(ABORT, 'assignment_organization_mismatch')
  WHERE NEW.assigned_user_id IS NOT NULL AND (
    NEW.organization_id IS NULL OR
    (SELECT organization_id FROM managed_users WHERE id = NEW.assigned_user_id) != NEW.organization_id
  );

  SELECT RAISE(ABORT, 'assignment_group_mismatch')
  WHERE NEW.group_id IS NOT NULL AND NEW.assigned_user_id IS NOT NULL AND (
    SELECT group_id FROM managed_users WHERE id = NEW.assigned_user_id
  ) IS NOT NULL AND (
    SELECT group_id FROM managed_users WHERE id = NEW.assigned_user_id
  ) != NEW.group_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_installations_org_update
BEFORE UPDATE OF organization_id, group_id, assigned_user_id ON installations
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'assignment_organization_mismatch')
  WHERE NEW.group_id IS NOT NULL AND (
    NEW.organization_id IS NULL OR
    (SELECT organization_id FROM groups WHERE id = NEW.group_id) != NEW.organization_id
  );

  SELECT RAISE(ABORT, 'assignment_organization_mismatch')
  WHERE NEW.assigned_user_id IS NOT NULL AND (
    NEW.organization_id IS NULL OR
    (SELECT organization_id FROM managed_users WHERE id = NEW.assigned_user_id) != NEW.organization_id
  );

  SELECT RAISE(ABORT, 'assignment_group_mismatch')
  WHERE NEW.group_id IS NOT NULL AND NEW.assigned_user_id IS NOT NULL AND (
    SELECT group_id FROM managed_users WHERE id = NEW.assigned_user_id
  ) IS NOT NULL AND (
    SELECT group_id FROM managed_users WHERE id = NEW.assigned_user_id
  ) != NEW.group_id;
END;
