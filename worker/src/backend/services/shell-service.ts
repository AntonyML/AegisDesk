import type { ShellConfig } from "../../contracts/shell-config";
import { CycleReader, cyclePolicy } from "../domain/cycles";
import type {
  EventInput,
  StateInput,
  TermsAcceptanceInput,
} from "../http/validation";
import { EventRepository } from "../persistence/repositories/event-repository";
import { InstallationRepository } from "../persistence/repositories/installation-repository";
import type { InstallationRecord } from "../persistence/schema";
import { StateSigner } from "../security/signing";
import { ShellConfigService } from "./shell-config-service";

const DAY_MS = 24 * 60 * 60 * 1000;

export class ShellService {
  private readonly cycles: CycleReader;
  private readonly events: EventRepository;
  private readonly installations: InstallationRepository;
  private readonly signer: StateSigner;
  private readonly config: ShellConfigService;

  constructor(
    private readonly env: Env,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.cycles = new CycleReader(env);
    this.events = new EventRepository(env);
    this.installations = new InstallationRepository(env);
    this.signer = new StateSigner(env);
    this.config = new ShellConfigService(env, now);
  }

  async state(
    installation: InstallationRecord,
    input: StateInput,
  ): Promise<{ state_token: string }> {
    const now = this.now();
    const serverTime = now.toISOString();
    const cycle = await this.cycles.activeCycle(installation.id);
    const dayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    ).toISOString();
    const eventTypes = await this.events.typesForDay(installation.id, dayStart);
    const shellConfig = await this.config.build(installation);
    const notice =
      installation.status === "active"
        ? cyclePolicy.evaluate(
            now,
            cycle,
            eventTypes,
            shellConfig.support.area_name || this.env.CONTACT_NAME,
          )
        : null;
    await this.events.insert({
      id: crypto.randomUUID(),
      installationId: installation.id,
      cycleId: cycle?.id,
      openId: input.open_id,
      serverReceivedAt: serverTime,
      type: "opening",
      shellVersion: input.shell_version,
      sidcVersion: input.sidc_version,
      equipmentName: installation.equipmentName,
      payloadJson: JSON.stringify({}),
    });
    await this.installations.markOpened(installation.id, {
      lastOpenedAt: serverTime,
      shellVersion: input.shell_version,
      sidcVersion: input.sidc_version,
    });
    if (notice) {
      await this.events.insert({
        id: crypto.randomUUID(),
        installationId: installation.id,
        cycleId: cycle?.id,
        openId: input.open_id,
        serverReceivedAt: serverTime,
        type: noticeEventType(notice.frequency),
        payloadJson: JSON.stringify({ notice_id: notice.id }),
      });
    }
    const cacheUntil = new Date(now.getTime() + DAY_MS).toISOString();
    return {
      state_token: await this.signer.sign({
        sub: installation.id,
        protocol_version: 1,
        server_time: serverTime,
        cache_until: cacheUntil,
        contact: {
          name: shellConfig.support.area_name || this.env.CONTACT_NAME,
          ticket_url:
            shellConfig.support.links.find(
              (link) => link.label === "Abrir ticket",
            )?.url || this.env.TICKET_URL,
        },
        notices: notice ? [notice] : [],
        config: shellConfig,
      }),
    };
  }

  async configToken(installation: InstallationRecord): Promise<{
    config: ShellConfig;
    config_token: string;
  }> {
    const config = await this.config.build(installation);
    const now = this.now();
    return {
      config,
      config_token: await this.signer.sign({
        sub: installation.id,
        protocol_version: 1,
        server_time: now.toISOString(),
        cache_until: new Date(now.getTime() + DAY_MS).toISOString(),
        contact: {
          name: config.support.area_name || this.env.CONTACT_NAME,
          ticket_url:
            config.support.links.find((link) => link.label === "Abrir ticket")
              ?.url || this.env.TICKET_URL,
        },
        notices: [],
        config,
      }),
    };
  }

  async recordEvent(
    installation: InstallationRecord,
    input: EventInput,
  ): Promise<void> {
    const cycle = await this.cycles.activeCycle(installation.id);
    await this.events.insert({
      id: crypto.randomUUID(),
      installationId: installation.id,
      cycleId: cycle?.id,
      openId: input.open_id,
      serverReceivedAt: this.now().toISOString(),
      type: input.type,
      shellVersion: input.shell_version,
      sidcVersion: input.sidc_version,
      equipmentName: input.equipment_name ?? installation.equipmentName,
      consentState: input.consent_state,
      launchResult: input.launch_result,
      payloadJson: JSON.stringify({}),
    });
  }

  async recordTermsAcceptance(
    installation: InstallationRecord,
    input: TermsAcceptanceInput,
  ): Promise<void> {
    const receivedAt = this.now().toISOString();
    const shellVersion = input.shellVersion || installation.shellVersion;
    await this.env.DB.prepare(
      `INSERT INTO terms_acceptances (
        id, installation_id, terms_version, terms_sha256, accepted_at_client, received_at, method, shell_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(installation_id, terms_version) DO NOTHING`,
    )
      .bind(
        crypto.randomUUID(),
        installation.id,
        input.termsVersion,
        input.termsSha256,
        input.acceptedAt,
        receivedAt,
        input.method,
        shellVersion,
      )
      .run();

    await this.events.insert({
      id: crypto.randomUUID(),
      installationId: installation.id,
      serverReceivedAt: receivedAt,
      type: "terms_accepted",
      shellVersion,
      payloadJson: JSON.stringify({
        terms_version: input.termsVersion,
        method: input.method,
      }),
    });
  }
}

function noticeEventType(frequency: string): string {
  if (frequency === "once_in_final_14_days") return "notice:final_14_days";
  if (frequency === "daily_in_final_7_days") return "notice:final_7_days";
  return "notice:expired";
}
