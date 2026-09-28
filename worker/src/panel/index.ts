import { html } from "hono/html";

type InstallationView = {
  id: string;
  equipmentName: string;
  shellVersion: string;
  sidcVersion: string;
  lastOpenedAt: string | null;
  status: string;
  cycleId: string | null;
  dueAt: string | null;
};

type TicketView = {
  id: string;
  createdAt: string;
  name: string;
  team: string;
  description: string;
  status: string;
  notified: boolean;
};

type EventView = {
  serverReceivedAt: string;
  equipmentName: string | null;
  type: string;
  windowsUser: string | null;
  consentState: string | null;
  launchResult: string | null;
};

const panelScript = `
const output = document.querySelector('#panel-output');
const show = (value) => { if (output) output.textContent = value; };
document.querySelector('#new-code')?.addEventListener('click', async () => {
  const response = await fetch('/api/v1/admin/enrollment-codes', { method: 'POST', headers: {'content-type': 'application/json'}, body: '{}' });
  const body = await response.json();
  show(response.ok ? 'Código: ' + body.code + ' (vence ' + body.expires_at + ')' : 'No se pudo generar el código.');
});
document.querySelectorAll('[data-revoke]').forEach((button) => button.addEventListener('click', async () => {
  const id = button.dataset.revoke;
  const response = await fetch('/api/v1/admin/installations/' + id + '/revoke', { method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({reason: 'Revocación solicitada desde el panel'}) });
  show(response.ok ? 'Instalación revocada.' : 'No se pudo revocar la instalación.');
  if (response.ok) window.location.reload();
}));
document.querySelectorAll('[data-renew]').forEach((button) => button.addEventListener('click', async () => {
  const id = button.dataset.renew;
  const reason = window.prompt('Motivo de la renovación:');
  if (!id || !reason) return;
  const response = await fetch('/api/v1/admin/cycles/' + id + '/renew', { method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({reason}) });
  show(response.ok ? 'Ciclo renovado.' : 'No se pudo renovar el ciclo.');
  if (response.ok) window.location.reload();
}));
document.querySelectorAll('[data-adjust]').forEach((button) => button.addEventListener('click', async () => {
  const id = button.dataset.adjust;
  const dueAt = window.prompt('Nueva fecha de vencimiento (ISO 8601 UTC):');
  const reason = window.prompt('Motivo del ajuste:');
  if (!id || !dueAt || !reason) return;
  const response = await fetch('/api/v1/admin/cycles/' + id, { method: 'PATCH', headers: {'content-type': 'application/json'}, body: JSON.stringify({due_at: dueAt, reason}) });
  show(response.ok ? 'Ciclo ajustado.' : 'No se pudo ajustar el ciclo.');
  if (response.ok) window.location.reload();
}));
document.querySelectorAll('[data-ticket]').forEach((form) => form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = form.dataset.ticket;
  const status = form.querySelector('select').value;
  const response = await fetch('/api/v1/admin/tickets/' + id, { method: 'PATCH', headers: {'content-type': 'application/json'}, body: JSON.stringify({status}) });
  show(response.ok ? 'Ticket actualizado.' : 'No se pudo actualizar el ticket.');
  if (response.ok) window.location.reload();
}));
`;

export function panelPage(
  installations: InstallationView[],
  tickets: TicketView[],
  events: EventView[],
) {
  return html`<!doctype html>
  <html lang="es">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>AegisDesk · Panel</title>
      <style>
        :root { color-scheme: light; font-family: Inter, system-ui, sans-serif; background: #f4f7fb; color: #162033; }
        body { margin: 0; } main { max-width: 1180px; margin: auto; padding: 32px; }
        .top { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
        .brand { letter-spacing: .02em; } .muted { color: #667085; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 24px; }
        section { background: white; border: 1px solid #dce3ed; border-radius: 16px; padding: 20px; box-shadow: 0 8px 24px #102a4d0d; }
        table { width: 100%; border-collapse: collapse; font-size: 14px; } th, td { padding: 10px 8px; border-bottom: 1px solid #edf0f5; text-align: left; vertical-align: top; }
        button, select { border: 1px solid #9aa9bd; background: white; border-radius: 8px; padding: 8px 10px; cursor: pointer; }
        button.primary { color: white; background: #2457d6; border-color: #2457d6; } button.danger { color: #a42626; }
        .pill { display: inline-block; padding: 3px 8px; border-radius: 999px; background: #e9eefb; } .pill.revoked { background: #fde7e7; color: #9d2424; }
        #panel-output { min-height: 24px; color: #2457d6; }
        @media (max-width: 700px) { main { padding: 18px; } .top { align-items: flex-start; flex-direction: column; } table { display: block; overflow-x: auto; } }
      </style>
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
      <script>${panelScript}</script>
    </body>
  </html>`;
}
