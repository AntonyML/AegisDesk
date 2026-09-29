export type PanelInstallation = {
  id: string;
  equipmentName: string;
  shellVersion: string;
  sidcVersion: string;
  lastOpenedAt: string | null;
  status: string;
  cycleId: string | null;
  dueAt: string | null;
  organizationId: string | null;
  organizationName: string | null;
  groupId: string | null;
  groupName: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  sidcTarget: string;
  latestTermsVersion?: string | null;
  termsPending?: boolean;
};

export type PanelOrganization = {
  id: string;
  name: string;
  status: string;
};

export type PanelGroup = {
  id: string;
  organizationId: string;
  name: string;
  status: string;
};

export type PanelManagedUser = {
  id: string;
  organizationId: string;
  groupId: string | null;
  displayName: string;
  email: string | null;
  status: string;
};

export type PanelAdminData = {
  organizations: PanelOrganization[];
  groups: PanelGroup[];
  managedUsers: PanelManagedUser[];
  support?: {
    title: string;
    message: string;
    notice: string;
    areaName: string;
    contactEmail: string | null;
    contactPhone: string | null;
    hours: string;
    ticketUrl: string | null;
    docsUrl: string | null;
  };
};

export type PanelTicket = {
  id: string;
  createdAt: string;
  name: string;
  team: string;
  description: string;
  status: string;
  notified: boolean;
};

export type PanelEvent = {
  serverReceivedAt: string;
  equipmentName: string | null;
  type: string;
  windowsUser: string | null;
  consentState: string | null;
  launchResult: string | null;
};
