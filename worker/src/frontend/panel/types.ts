export type PanelInstallation = {
  id: string;
  equipmentName: string;
  shellVersion: string;
  sidcVersion: string;
  lastOpenedAt: string | null;
  status: string;
  cycleId: string | null;
  dueAt: string | null;
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
