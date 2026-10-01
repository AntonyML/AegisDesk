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
import type {
  PanelAdminData,
  PanelEvent,
  PanelInstallation,
  PanelTicket,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function panelPage(
  installations: PanelInstallation[],
  tickets: PanelTicket[],
  events: PanelEvent[],
  admin: PanelAdminData = { organizations: [], groups: [], managedUsers: [] },
  role: "platform_owner" | "org_admin" | "org_viewer" = "platform_owner",
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
    return html`<tr>
      <td data-label="Equipo">
        <span class="table-primary">${item.equipmentName}</span>
        <span class="table-secondary">${truncateId(item.id)} · ${versions}</span>
        <span class="table-secondary">${item.organizationName ?? "Sin organización"} · ${item.groupName ?? "Sin grupo"}</span>
        <span class="table-secondary">Términos: ${item.latestTermsVersion ?? "Sin aceptar"} ${item.termsPending ? html`<strong style="color: #f59e0b;">(Pendiente)</strong>` : ""}</span>
      </td>
      <td data-label="Estado"><span class="status-badge ${statusTone(item.status)}">${statusLabel(item.status)}</span></td>
      <td data-label="Última conexión" class="nowrap">${lastOpened}</td>
      <td data-label="Ciclo"><span class="table-secondary">${cycle}</span></td>
      <td data-label="Acciones">
        ${
          role === "org_viewer"
            ? html`<span class="table-secondary">Lectura</span>`
            : html`<details class="action-menu">
          <summary aria-label="${`Acciones para ${item.equipmentName}`}">⋯</summary>
          <div class="menu-items">
            <button type="button" data-equipment-open
              data-equipment-name="${item.equipmentName}"
              data-equipment-id="${item.id}"
              data-equipment-status="${item.status}"
              data-equipment-status-label="${statusLabel(item.status)}"
              data-equipment-last-opened="${lastOpened}"
              data-equipment-cycle="${cycle}"
              data-equipment-cycle-id="${item.cycleId ?? ""}"
              data-equipment-due-at="${item.dueAt ?? ""}"
              data-equipment-versions="${versions}"
              data-equipment-org-id="${item.organizationId ?? ""}"
              data-equipment-group-id="${item.groupId ?? ""}"
              data-equipment-user-id="${item.assignedUserId ?? ""}"
              data-equipment-sidc-target="${item.sidcTarget}">Ver / administrar</button>
            <button type="button" data-equipment-copy data-copy-value="${item.id}">Copiar identificador</button>
            ${item.status === "active" ? html`<button type="button" class="danger" data-revoke="${item.id}">Revocar instalación</button>` : ""}
          </div>
        </details>`
        }
      </td>
    </tr>`;
  });

  const organizationOptions = admin.organizations.map(
    (organization) =>
      html`<option value="${organization.id}">${organization.name}</option>`,
  );
  const groupOptions = admin.groups.map(
    (group) =>
      html`<option value="${group.id}" data-organization-id="${group.organizationId}">${group.name}</option>`,
  );
  const managedUserOptions = admin.managedUsers.map(
    (user) =>
      html`<option value="${user.id}" data-organization-id="${user.organizationId}" data-group-id="${user.groupId ?? ""}">${user.displayName}${user.email ? ` · ${user.email}` : ""}</option>`,
  );

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
          <a href="#administration">Administración</a>
          <button type="button" id="new-code" class="button primary">Generar código</button>
          <a href="/cdn-cgi/access/logout?returnTo=https%3A%2F%2Faegisdesk.tonyml.com%2Flogout" id="logout-button" class="button" role="button">Cerrar sesión</a>
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

          <section class="surface full-width" id="administration" aria-labelledby="administration-heading">
            <div class="section-heading"><div><h2 id="administration-heading">Administración</h2><p>Organizaciones, grupos, usuarios asignados y soporte remoto.</p></div><span class="muted">Cambios protegidos por Cloudflare Access</span></div>
            <div class="admin-grid">
              <article class="admin-card">
                <h3>Organizaciones</h3>
                <form id="organization-form" data-directory-form="organization">
                  <input type="hidden" name="id" />
                  <div class="form-field"><label for="organization-name">Nombre</label><input class="field" id="organization-name" name="name" maxlength="128" required /></div>
                  <div class="form-field"><label for="organization-status">Estado</label><select class="field" id="organization-status" name="status"><option value="active">Activa</option><option value="disabled">Desactivada</option></select></div>
                  <div class="form-actions"><button type="submit" class="button primary">Guardar organización</button><button type="button" class="button" data-directory-reset="organization">Limpiar</button></div>
                </form>
                <ul class="admin-list">${admin.organizations.map((organization) => html`<li><span><strong>${organization.name}</strong><small>${organization.status === "active" ? "Activa" : "Desactivada"}</small></span><button type="button" class="button small" data-directory-edit="organization" data-directory-id="${organization.id}" data-directory-name="${organization.name}" data-directory-status="${organization.status}">Editar</button></li>`)}</ul>
              </article>
              <article class="admin-card">
                <h3>Grupos</h3>
                <form id="group-form" data-directory-form="group">
                  <input type="hidden" name="id" />
                  <div class="form-field"><label for="group-name">Nombre</label><input class="field" id="group-name" name="name" maxlength="128" required /></div>
                  <div class="form-field"><label for="group-organization">Organización</label><select class="field" id="group-organization" name="organization_id" required><option value="">Seleccioná una organización</option>${organizationOptions}</select></div>
                  <div class="form-field"><label for="group-status">Estado</label><select class="field" id="group-status" name="status"><option value="active">Activo</option><option value="disabled">Desactivado</option></select></div>
                  <div class="form-actions"><button type="submit" class="button primary">Guardar grupo</button><button type="button" class="button" data-directory-reset="group">Limpiar</button></div>
                </form>
                <ul class="admin-list">${admin.groups.map((group) => html`<li><span><strong>${group.name}</strong><small>${admin.organizations.find((item) => item.id === group.organizationId)?.name ?? "Sin organización"}</small></span><button type="button" class="button small" data-directory-edit="group" data-directory-id="${group.id}" data-directory-name="${group.name}" data-directory-status="${group.status}" data-directory-organization-id="${group.organizationId}">Editar</button></li>`)}</ul>
              </article>
              <article class="admin-card">
                <h3>Usuarios administrados</h3>
                <form id="managed-user-form" data-directory-form="managed-user">
                  <input type="hidden" name="id" />
                  <div class="form-field"><label for="managed-user-name">Nombre</label><input class="field" id="managed-user-name" name="display_name" maxlength="128" required /></div>
                  <div class="form-field"><label for="managed-user-email">Correo (opcional)</label><input class="field" id="managed-user-email" name="email" type="email" maxlength="320" /></div>
                  <div class="form-field"><label for="managed-user-organization">Organización</label><select class="field" id="managed-user-organization" name="organization_id" required><option value="">Seleccioná una organización</option>${organizationOptions}</select></div>
                  <div class="form-field"><label for="managed-user-group">Grupo (opcional)</label><select class="field" id="managed-user-group" name="group_id"><option value="">Sin grupo</option>${groupOptions}</select></div>
                  <div class="form-field"><label for="managed-user-status">Estado</label><select class="field" id="managed-user-status" name="status"><option value="active">Activo</option><option value="disabled">Desactivado</option></select></div>
                  <div class="form-actions"><button type="submit" class="button primary">Guardar usuario</button><button type="button" class="button" data-directory-reset="managed-user">Limpiar</button></div>
                </form>
                <ul class="admin-list">${admin.managedUsers.map((user) => html`<li><span><strong>${user.displayName}</strong><small>${admin.organizations.find((item) => item.id === user.organizationId)?.name ?? "Sin organización"}${user.email ? ` · ${user.email}` : ""}</small></span><button type="button" class="button small" data-directory-edit="managed-user" data-directory-id="${user.id}" data-directory-name="${user.displayName}" data-directory-email="${user.email ?? ""}" data-directory-status="${user.status}" data-directory-organization-id="${user.organizationId}" data-directory-group-id="${user.groupId ?? ""}">Editar</button></li>`)}</ul>
              </article>
              <article class="admin-card admin-card-wide">
                <h3>Soporte remoto global</h3>
                <p class="form-help">El Shell recibirá esta información como configuración estructurada. Solo se aceptan texto plano y enlaces HTTPS.</p>
                <form id="support-form" data-support-form>
                  <div class="form-grid"><div class="form-field"><label for="support-title">Título</label><input class="field" id="support-title" name="title" maxlength="128" required value="${admin.support?.title ?? "Soporte AegisDesk"}" /></div><div class="form-field"><label for="support-area">Área responsable</label><input class="field" id="support-area" name="area_name" maxlength="128" value="${admin.support?.areaName ?? ""}" /></div><div class="form-field"><label for="support-email">Correo</label><input class="field" id="support-email" name="contact_email" type="email" maxlength="320" value="${admin.support?.contactEmail ?? ""}" /></div><div class="form-field"><label for="support-phone">Teléfono</label><input class="field" id="support-phone" name="contact_phone" maxlength="32" value="${admin.support?.contactPhone ?? ""}" /></div><div class="form-field"><label for="support-hours">Horarios</label><input class="field" id="support-hours" name="hours" maxlength="256" value="${admin.support?.hours ?? ""}" /></div><div class="form-field"><label for="support-ticket-url">URL de tickets</label><input class="field" id="support-ticket-url" name="ticket_url" type="url" placeholder="https://…" value="${admin.support?.ticketUrl ?? ""}" /></div><div class="form-field"><label for="support-docs-url">URL de documentación</label><input class="field" id="support-docs-url" name="docs_url" type="url" placeholder="https://…" value="${admin.support?.docsUrl ?? ""}" /></div></div>
                  <div class="form-field"><label for="support-message">Descripción</label><textarea class="field" id="support-message" name="message" maxlength="2000" rows="3" required>${admin.support?.message ?? ""}</textarea></div>
                  <div class="form-field"><label for="support-notice">Aviso temporal</label><textarea class="field" id="support-notice" name="notice" maxlength="1000" rows="2">${admin.support?.notice ?? ""}</textarea></div>
                  <div class="form-actions"><span id="support-feedback" class="drawer-feedback" role="status"></span><button type="submit" class="button primary">Guardar soporte</button></div>
                </form>
              </article>
            </div>
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
          <div class="dialog-header"><div><p class="eyebrow">Administración de equipo</p><h2 id="equipment-detail-name">Equipo</h2><p id="equipment-detail-id" class="muted">—</p></div><button type="button" class="dialog-close" data-dialog-close="equipment-dialog" aria-label="Cerrar">×</button></div>
          <form id="equipment-form">
            <input type="hidden" id="equipment-id" name="id" /><input type="hidden" id="equipment-cycle-id" name="cycle_id" />
            <div class="form-grid"><div class="form-field"><label for="equipment-name">Nombre visible</label><input class="field" id="equipment-name" name="equipment_name" maxlength="128" required /></div><div class="form-field"><label for="equipment-status">Estado administrativo</label><select class="field" id="equipment-status" name="status"><option value="active">Activo</option><option value="disabled">Desactivado</option><option value="revoked">Revocado</option></select></div><div class="form-field"><label for="equipment-expires">Vencimiento del ciclo <span class="form-help">(hora local, se guarda en UTC)</span></label><input class="field" id="equipment-expires" name="due_at" type="datetime-local" /></div><div class="form-field"><label for="equipment-organization">Organización</label><select class="field" id="equipment-organization" name="organization_id"><option value="">Sin organización</option>${organizationOptions}</select></div><div class="form-field"><label for="equipment-group">Grupo</label><select class="field" id="equipment-group" name="group_id"><option value="">Sin grupo</option>${groupOptions}</select></div><div class="form-field"><label for="equipment-user">Usuario asignado</label><select class="field" id="equipment-user" name="assigned_user_id"><option value="">Sin usuario</option>${managedUserOptions}</select></div></div>
            <dl class="equipment-detail"><div><dt>Última conexión</dt><dd id="equipment-detail-last-opened">—</dd></div><div><dt>Versiones</dt><dd id="equipment-detail-versions">—</dd></div><div><dt>Ruta SIDC registrada</dt><dd id="equipment-detail-sidc-target">—</dd></div><div><dt>Asignación actual</dt><dd id="equipment-detail-assignment">—</dd></div></dl>
            <div class="form-field"><label for="equipment-reason">Motivo del cambio</label><input class="field" id="equipment-reason" name="reason" maxlength="512" required value="Cambio realizado desde el panel" /></div>
            <div class="dialog-actions"><button type="button" class="button" data-equipment-copy>Copiar identificador</button><span id="equipment-feedback" class="drawer-feedback" role="status"></span><button type="button" class="button" data-dialog-close="equipment-dialog">Cancelar</button><button type="submit" class="button primary">Guardar cambios</button></div>
          </form>
        </div>
      </dialog>

      <div id="panel-toast" class="toast" role="status" aria-live="polite"></div>
      <script>${raw(panelScript)}</script>
    </body>
  </html>`;
}
