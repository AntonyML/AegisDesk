import type { ShellConfig } from "../../contracts/shell-config";
import { CycleReader } from "../domain/cycles";
import type { InstallationRecord } from "../persistence/schema";
import { sha256 } from "../security/crypto";
import { DirectoryService } from "./directory-service";
import { SupportConfigService } from "./support-config-service";

export class ShellConfigService {
  private readonly directory: DirectoryService;
  private readonly support: SupportConfigService;
  private readonly cycles: CycleReader;

  constructor(
    env: Env,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.directory = new DirectoryService(env);
    this.support = new SupportConfigService(env);
    this.cycles = new CycleReader(env);
  }

  async build(installation: InstallationRecord): Promise<ShellConfig> {
    const [organization, group, user, cycle, support] = await Promise.all([
      installation.organizationId
        ? this.directory.requireOrganization(installation.organizationId)
        : null,
      installation.groupId
        ? this.directory.requireGroup(installation.groupId)
        : null,
      installation.assignedUserId
        ? this.directory.requireManagedUser(installation.assignedUserId)
        : null,
      this.cycles.activeCycle(installation.id),
      this.support.getForOrganization(installation.organizationId),
    ]);

    const base = {
      schema_version: 1 as const,
      generated_at: this.now().toISOString(),
      installation: {
        id: installation.id,
        status: installation.status,
        cycle_expires_at: cycle?.dueAt ?? null,
        device: {
          name: installation.equipmentName,
          shell_version: installation.shellVersion,
          sidc_version: installation.sidcVersion,
          last_opened_at: installation.lastOpenedAt,
        },
        organization: organization
          ? { id: organization.id, name: organization.name }
          : null,
        group: group ? { id: group.id, name: group.name } : null,
        user: user ? { id: user.id, display_name: user.displayName } : null,
      },
      support: {
        title: support.title,
        message: support.message,
        notice: support.notice,
        area_name: support.areaName,
        hours: support.hours,
        contacts: [
          ...(support.contactEmail
            ? [
                {
                  type: "email" as const,
                  label: "Correo",
                  value: `mailto:${support.contactEmail}`,
                },
              ]
            : []),
          ...(support.contactPhone
            ? [
                {
                  type: "phone" as const,
                  label: "Teléfono",
                  value: `tel:${support.contactPhone}`,
                },
              ]
            : []),
        ],
        links: [
          ...(support.ticketUrl
            ? [{ label: "Abrir ticket", url: support.ticketUrl }]
            : []),
          ...(support.docsUrl
            ? [{ label: "Documentación", url: support.docsUrl }]
            : []),
        ],
        updated_at: support.updatedAt,
      },
    } satisfies Omit<ShellConfig, "revision">;
    const revision = await sha256(
      JSON.stringify({
        schema_version: base.schema_version,
        installation: {
          id: base.installation.id,
          status: base.installation.status,
          cycle_expires_at: base.installation.cycle_expires_at,
          organization: base.installation.organization,
          group: base.installation.group,
          user: base.installation.user,
          device: { name: base.installation.device.name },
        },
        support: base.support,
      }),
    );
    return { ...base, revision };
  }
}
