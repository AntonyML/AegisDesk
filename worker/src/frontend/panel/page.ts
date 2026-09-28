import { html, raw } from "hono/html";
import { panelScript } from "./script";
import { panelStyles } from "./styles";
import type { PanelEvent, PanelInstallation, PanelTicket } from "./types";

export function panelPage(
  installations: PanelInstallation[],
  tickets: PanelTicket[],
  events: PanelEvent[],
) {
  return html`<!doctype html>
  <html lang="es">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>AegisDesk · Panel</title>
      <style>${raw(panelStyles)}</style>
    </head>
    <body>
      <main>
        <div class="top"><div><div class="brand"><strong>AegisDesk</strong> · Panel de soporte</div><div class="muted">Solo personal autorizado por Cloudflare Access.</div></div><button id="new-code" class="primary">Generar código de enrolamiento</button></div>
        <p id="panel-output" role="status"></p>
        <div class="grid">
          <section><h2>Equipos y ciclos</h2><table><thead><tr><th>Equipo</th><th>Última apertura</th><th>Ciclo</th><th>Acciones</th></tr></thead><tbody>${installations.map((item) => html`<tr><td><strong>${item.equipmentName}</strong><br><small>${item.id}</small><br><span class="pill ${item.status === "revoked" ? "revoked" : ""}">${item.status}</span></td><td>${item.lastOpenedAt ?? "Nunca"}<br><small>${item.shellVersion} · SIDC ${item.sidcVersion}</small></td><td>${item.dueAt ?? "Sin ciclo"}</td><td>${item.status === "active" ? html`<button data-renew=${item.cycleId ?? ""}>Renovar</button> <button data-adjust=${item.cycleId ?? ""}>Ajustar</button> <button class="danger" data-revoke=${item.id}>Revocar</button>` : ""}</td></tr>`)}</tbody></table></section>
          <section><h2>Telemetría reciente</h2><table><thead><tr><th>Fecha</th><th>Equipo</th><th>Evento</th><th>Usuario</th><th>Resultado</th></tr></thead><tbody>${events.map((event) => html`<tr><td>${event.serverReceivedAt}</td><td>${event.equipmentName ?? "—"}</td><td>${event.type}<br><small>consentimiento: ${event.consentState ?? "—"}</small></td><td>${event.windowsUser ?? "—"}</td><td>${event.launchResult ?? "—"}</td></tr>`)}</tbody></table></section>
          <section><h2>Tickets</h2><table><thead><tr><th>Ticket</th><th>Descripción</th><th>Estado</th></tr></thead><tbody>${tickets.map((ticket) => html`<tr><td><strong>${ticket.team}</strong><br>${ticket.name}<br><small>${ticket.id}</small><br><small>${ticket.createdAt} · correo ${ticket.notified ? "enviado" : "pendiente"}</small></td><td>${ticket.description}</td><td><form data-ticket=${ticket.id}><select aria-label="Estado del ticket"><option value="open" selected=${ticket.status === "open"}>Abierto</option><option value="in_progress" selected=${ticket.status === "in_progress"}>En progreso</option><option value="resolved" selected=${ticket.status === "resolved"}>Resuelto</option><option value="spam" selected=${ticket.status === "spam"}>Spam</option></select><button type="submit">Guardar</button></form></td></tr>`)}</tbody></table></section>
        </div>
      </main>
      <script>${raw(panelScript)}</script>
    </body>
  </html>`;
}
