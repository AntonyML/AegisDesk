import { html, raw } from "hono/html";
import {
  cycleLabel,
  eventLabel,
  eventTone,
  formatDate,
  formatRelative,
  statusLabel,
  statusTone,
  truncateId,
} from "./format";
import { panelScript } from "./script";
import { panelStyles } from "./styles";
import type { PanelEvent, PanelInstallation, PanelTicket } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function panelPage(
  installations: PanelInstallation[],
  tickets: PanelTicket[],
  events: PanelEvent[],
) {
  const now = Date.now();
  const activeInstallations = installations.filter(
    (item) => item.status === "active",
  ).length;
  const currentCycles = installations.filter(
    (item) => item.cycleId !== null,
  ).length;
  const openTickets = tickets.filter(
    (item) => !["resolved", "spam"].includes(item.status),
  ).length;
  const recentEventCount = events.filter((item) => {
    const timestamp = new Date(item.serverReceivedAt).getTime();
    return !Number.isNaN(timestamp) && timestamp >= now - DAY_MS;
  }).length;
  const recentEvents = [...events]
    .sort(
      (left, right) =>
        new Date(right.serverReceivedAt).getTime() -
        new Date(left.serverReceivedAt).getTime(),
    )
    .slice(0, 5);

  const installationRows = installations.map((item) => {
    const lastOpened = item.lastOpenedAt
      ? `${formatDate(item.lastOpenedAt)} · ${formatRelative(item.lastOpenedAt)}`
      : "Nunca";
    const cycle = cycleLabel(item.dueAt);
    const versions = `Shell ${item.shellVersion} · SIDC ${item.sidcVersion}`;
    const cycleActions =
      item.status === "active" && item.cycleId
        ? html`<button type="button" data-renew="${item.cycleId}">Renovar ciclo</button><button type="button" data-adjust="${item.cycleId}">Ajustar fecha</button>`
        : html`<span class="muted">Sin acciones disponibles</span>`;

    return html`<tr>
      <td data-label="Equipo">
        <span class="table-primary">${item.equipmentName}</span>
        <span class="table-secondary">${truncateId(item.id)} · ${versions}</span>
      </td>
      <td data-label="Estado"><span class="status-badge ${statusTone(item.status)}">${statusLabel(item.status)}</span></td>
      <td data-label="Última conexión" class="nowrap">${lastOpened}</td>
      <td data-label="Ciclo"><span class="table-secondary">${cycle}</span></td>
      <td data-label="Acciones">
        <details class="action-menu">
          <summary aria-label="${`Acciones para ${item.equipmentName}`}">⋯</summary>
          <div class="menu-items">
            <button type="button" data-equipment-open
              data-equipment-name="${item.equipmentName}"
              data-equipment-id="${item.id}"
              data-equipment-status-label="${statusLabel(item.status)}"
              data-equipment-last-opened="${lastOpened}"
              data-equipment-cycle="${cycle}"
              data-equipment-versions="${versions}">Ver detalle</button>
            ${cycleActions}
            <button type="button" data-equipment-copy data-copy-value="${item.id}">Copiar identificador</button>
            ${item.status === "active" ? html`<button type="button" class="danger" data-revoke="${item.id}">Revocar instalación</button>` : ""}
          </div>
        </details>
      </td>
    </tr>`;
  });

  const ticketRows = tickets.map((ticket) => {
    const searchText =
      `${ticket.id} ${ticket.name} ${ticket.team} ${ticket.description}`.toLowerCase();
    return html`<tr data-ticket-row
      data-ticket-id="${ticket.id}"
      data-ticket-name="${ticket.name}"
      data-ticket-team="${ticket.team}"
      data-ticket-description="${ticket.description}"
      data-ticket-created="${formatDate(ticket.createdAt)}"
      data-ticket-status="${ticket.status}"
      data-ticket-notified="${String(ticket.notified)}"
      data-ticket-search="${searchText}">
      <td data-label="Ticket">
        <button type="button" class="ticket-title-button" data-ticket-open>${ticket.name}</button>
        <span class="ticket-preview">${ticket.description}</span>
      </td>
      <td data-label="Solicitante"><span class="table-primary">${ticket.team}</span><span class="table-secondary">${ticket.name}</span></td>
      <td data-label="Creado" class="nowrap">${formatDate(ticket.createdAt)}<br><span class="table-secondary">${truncateId(ticket.id)}</span></td>
      <td data-label="Estado"><span class="status-badge ${statusTone(ticket.status)}">${statusLabel(ticket.status)}</span></td>
      <td data-label="Acciones"><button type="button" class="ticket-detail-button" data-ticket-open>Ver detalle</button></td>
    </tr>`;
  });

  return html`<!doctype html>
  <html lang="es">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>AegisDesk · Soporte</title>
      <style>${raw(panelStyles)}</style>
    </head>
    <body>
      <header class="app-header">
        <div class="brand-lockup">
          <span class="brand-mark" aria-hidden="true">A</span>
          <span class="brand-name">AegisDesk</span>
          <span class="brand-context" aria-label="Panel de soporte">Soporte</span>
        </div>
        <nav class="app-nav" aria-label="Navegación principal">
          <a href="#overview">Resumen</a>
          <a href="#activity">Actividad</a>
          <a href="#tickets">Tickets</a>
          <button type="button" id="new-code" class="button primary">Generar código</button>
        </nav>
      </header>

      <main class="page" id="overview">
        <div class="page-heading">
          <div>
            <p class="eyebrow">Operación diaria</p>
            <h1>Panel operativo</h1>
            <p>Supervisa equipos, ciclos y solicitudes desde un solo lugar.</p>
          </div>
          <p class="muted">Acceso restringido al personal autorizado.</p>
        </div>

        <section class="kpi-grid" aria-label="Indicadores principales">
          <article class="kpi"><span class="kpi-label">Equipos activos</span><strong class="kpi-value">${activeInstallations}</strong><span class="kpi-help">Instalaciones operativas</span></article>
          <article class="kpi"><span class="kpi-label">Ciclos vigentes</span><strong class="kpi-value">${currentCycles}</strong><span class="kpi-help">Con fecha de mantenimiento</span></article>
          <article class="kpi"><span class="kpi-label">Tickets abiertos</span><strong class="kpi-value">${openTickets}</strong><span class="kpi-help">Requieren seguimiento</span></article>
          <article class="kpi"><span class="kpi-label">Eventos últimas 24 h</span><strong class="kpi-value">${recentEventCount}</strong><span class="kpi-help">Recibidos por el Worker</span></article>
        </section>

        <div class="overview-grid">
          <section class="surface" aria-labelledby="equipment-heading">
            <div class="section-heading">
              <div><h2 id="equipment-heading">Equipos</h2><p>Estado de las instalaciones y próximos ciclos.</p></div>
              <span class="muted">${installations.length} registrados</span>
            </div>
            ${installations.length > 0 ? html`<div class="table-wrap"><table class="data-table"><thead><tr><th>Equipo</th><th>Estado</th><th>Última conexión</th><th>Ciclo</th><th>Acciones</th></tr></thead><tbody>${installationRows}</tbody></table></div>` : html`<div class="table-empty"><strong>No hay equipos registrados</strong><br>Genera un código para preparar una nueva instalación.</div>`}
          </section>

          <section class="surface activity-surface" id="activity" aria-labelledby="activity-heading" aria-label="Telemetría reciente">
            <div class="section-heading"><div><h2 id="activity-heading">Actividad reciente</h2><p>Los últimos eventos recibidos.</p></div><a class="section-link" href="#tickets">Ver toda la actividad →</a></div>
            ${recentEvents.length > 0 ? html`<ul class="activity-list">${recentEvents.map((event) => html`<li class="activity-item"><span class="event-dot ${eventTone(event.type)}" aria-hidden="true"></span><div><div class="activity-title">${eventLabel(event.type)}</div><div class="activity-meta">${event.equipmentName ?? "Equipo no identificado"} · ${formatRelative(event.serverReceivedAt)}<br>${event.windowsUser ?? "Usuario no informado"}${event.launchResult ? ` · ${event.launchResult}` : ""}</div></div></li>`)}</ul>` : html`<div class="activity-empty">Sin actividad reciente.</div>`}
          </section>

          <section class="surface full-width" id="tickets" aria-labelledby="tickets-heading">
            <div class="section-heading"><div><h2 id="tickets-heading">Tickets</h2><p>Gestiona solicitudes de soporte y deja trazabilidad de cada respuesta.</p></div><span class="muted">${tickets.length} registrados</span></div>
            <div class="ticket-toolbar">
              <label class="sr-only" for="ticket-search">Buscar tickets</label>
              <input class="search-field" id="ticket-search" type="search" placeholder="Buscar por nombre, equipo o descripción" autocomplete="off" />
              <label class="sr-only" for="ticket-status">Filtrar por estado</label>
              <select class="field" id="ticket-status">
                <option value="all">Todos los estados</option>
                <option value="open">Abiertos</option>
                <option value="in_progress">En progreso</option>
                <option value="resolved">Resueltos</option>
                <option value="spam">Spam</option>
              </select>
              <span id="ticket-results-count" class="ticket-results" role="status"></span>
            </div>
            ${tickets.length > 0 ? html`<div class="table-wrap"><table class="data-table"><thead><tr><th>Ticket</th><th>Solicitante</th><th>Creado</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${ticketRows}</tbody></table><div id="ticket-filter-empty" class="table-empty" hidden>No hay tickets que coincidan con los filtros.</div></div>` : html`<div class="table-empty">No hay tickets registrados.</div>`}
          </section>
        </div>
      </main>

      <aside id="ticket-drawer" class="drawer" aria-hidden="true" role="dialog" aria-labelledby="ticket-detail-title">
        <div class="drawer-header"><div><p class="eyebrow">Solicitud de soporte</p><h2 id="ticket-detail-title">Ticket</h2></div><button type="button" id="ticket-close" class="dialog-close" aria-label="Cerrar detalle">×</button></div>
        <div class="drawer-body">
          <p id="ticket-detail-description" class="drawer-description"></p>
          <dl class="detail-list">
            <div><dt>Equipo / área</dt><dd id="ticket-detail-team">—</dd></div>
            <div><dt>Identificador</dt><dd id="ticket-detail-id">—</dd></div>
            <div><dt>Creado</dt><dd id="ticket-detail-created">—</dd></div>
            <div><dt>Correo</dt><dd id="ticket-detail-email">—</dd></div>
          </dl>
        </div>
        <div class="drawer-footer"><span id="ticket-drawer-feedback" class="drawer-feedback" role="status"></span><div><label class="sr-only" for="ticket-status-detail">Estado del ticket</label><select id="ticket-status-detail" class="field"><option value="open">Abierto</option><option value="in_progress">En progreso</option><option value="resolved">Resuelto</option><option value="spam">Spam</option></select><button type="button" id="ticket-save" class="button primary">Guardar</button></div></div>
      </aside>
      <div id="ticket-drawer-backdrop" class="drawer-backdrop" aria-hidden="true"></div>

      <dialog id="enrollment-dialog" data-close-on-backdrop>
        <div class="dialog-content">
          <div class="dialog-header"><div><p class="eyebrow">Nueva instalación</p><h2>Generar código de enrolamiento</h2><p class="muted">El código se puede usar durante 30 minutos.</p></div><button type="button" class="dialog-close" data-dialog-close="enrollment-dialog" aria-label="Cerrar">×</button></div>
          <form id="enrollment-form">
            <div class="form-field"><label for="enrollment-reference">Referencia interna (opcional)</label><input class="field" id="enrollment-reference" name="reference" placeholder="Ej. Recepción norte" /><span class="form-help">Ayuda a identificar la instalación durante la entrega.</span></div>
            <div id="enrollment-result" class="code-result" aria-live="polite"><span class="form-help">Código generado</span><div id="generated-code" class="generated-code">—</div><span id="generated-expires" class="form-help"></span><button type="button" id="copy-generated-code" class="button small">Copiar código</button></div>
            <div class="dialog-actions"><button type="button" class="button" data-dialog-close="enrollment-dialog">Cancelar</button><button type="submit" class="button primary">Generar código</button></div>
          </form>
        </div>
      </dialog>

      <dialog id="equipment-dialog" data-close-on-backdrop>
        <div class="dialog-content">
          <div class="dialog-header"><div><p class="eyebrow">Detalle del equipo</p><h2 id="equipment-detail-name">Equipo</h2></div><button type="button" class="dialog-close" data-dialog-close="equipment-dialog" aria-label="Cerrar">×</button></div>
          <dl class="equipment-detail"><div><dt>Identificador</dt><dd id="equipment-detail-id">—</dd></div><div><dt>Estado</dt><dd id="equipment-detail-status">—</dd></div><div><dt>Última conexión</dt><dd id="equipment-detail-last-opened">—</dd></div><div><dt>Ciclo</dt><dd id="equipment-detail-cycle">—</dd></div><div><dt>Versiones</dt><dd id="equipment-detail-versions">—</dd></div></dl>
          <div class="dialog-actions"><button type="button" class="button" data-equipment-copy>Copiar identificador</button><button type="button" class="button primary" data-dialog-close="equipment-dialog">Listo</button></div>
        </div>
      </dialog>

      <div id="panel-toast" class="toast" role="status" aria-live="polite"></div>
      <script>${raw(panelScript)}</script>
    </body>
  </html>`;
}
