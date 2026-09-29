/**
 * Versioned data-only contract returned by GET /api/v1/shell/config.
 * The request uses the installation Bearer token. A valid ETag may produce
 * 304 without a body; config_token is signed with the existing EdDSA key.
 */
export type ShellConfigContact = {
  type: "email" | "phone";
  label: string;
  value: string;
};

export type ShellConfigLink = {
  label: string;
  url: string;
};

export type ShellSupportConfig = {
  title: string;
  message: string;
  notice: string;
  area_name: string;
  hours: string;
  contacts: ShellConfigContact[];
  links: ShellConfigLink[];
  updated_at: string;
};

export type ShellConfig = {
  schema_version: 1;
  revision: string;
  generated_at: string;
  installation: {
    id: string;
    status: "active" | "disabled" | "revoked";
    cycle_expires_at: string | null;
    device: {
      name: string;
      shell_version: string;
      sidc_version: string;
      last_opened_at: string | null;
    };
    organization: { id: string; name: string } | null;
    group: { id: string; name: string } | null;
    user: { id: string; display_name: string } | null;
  };
  support: ShellSupportConfig;
};
