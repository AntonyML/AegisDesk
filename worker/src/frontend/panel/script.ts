export const panelScript = `
const query = (selector, root = document) => root.querySelector(selector);
const queryAll = (selector, root = document) => Array.from(root.querySelectorAll(selector));
let toastTimer;

function showToast(message, tone = 'info') {
  const toast = query('#panel-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = 'toast is-visible ' + tone;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.className = 'toast'; }, 4200);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  let body = {};
  try { body = await response.json(); } catch { /* Respuestas sin cuerpo */ }
  if (!response.ok) throw new Error(body.message || body.error || 'La operación no se pudo completar.');
  return body;
}

function setBusy(button, busy, busyLabel = 'Guardando…') {
  if (!button) return;
  if (busy) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalLabel || button.textContent;
    button.disabled = false;
  }
}

async function copyText(value, successMessage) {
  try {
    await navigator.clipboard.writeText(value);
    showToast(successMessage, 'success');
  } catch {
    showToast('No se pudo copiar. Selecciona el valor manualmente.', 'error');
  }
}

const enrollmentDialog = query('#enrollment-dialog');
const enrollmentResult = query('#enrollment-result');
const enrollmentCode = query('#generated-code');
const enrollmentExpires = query('#generated-expires');

query('#new-code')?.addEventListener('click', () => {
  query('#enrollment-form')?.reset();
  enrollmentResult?.classList.remove('is-visible');
  enrollmentDialog?.showModal();
});

query('#enrollment-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = query('button[type=submit]', form);
  setBusy(submit, true, 'Generando…');
  try {
    const body = await requestJson('/api/v1/admin/enrollment-codes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (enrollmentCode) enrollmentCode.textContent = body.code || 'Código no disponible';
    if (enrollmentExpires) enrollmentExpires.textContent = body.expires_at ? 'Válido hasta ' + body.expires_at : 'Válido durante 30 minutos';
    enrollmentResult?.classList.add('is-visible');
    showToast('Código de enrolamiento generado.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    setBusy(submit, false);
  }
});

query('#copy-generated-code')?.addEventListener('click', () => {
  if (enrollmentCode?.textContent) copyText(enrollmentCode.textContent, 'Código copiado.');
});

queryAll('[data-dialog-close]').forEach((button) => button.addEventListener('click', () => {
  query(button.dataset.dialogClose)?.close();
}));

queryAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => {
  if (event.target === dialog && dialog.hasAttribute('data-close-on-backdrop')) dialog.close();
}));

const equipmentDialog = query('#equipment-dialog');
queryAll('[data-equipment-open]').forEach((button) => button.addEventListener('click', (event) => {
  const item = event.currentTarget.dataset;
  const values = {
    '#equipment-detail-name': item.equipmentName,
    '#equipment-detail-id': item.equipmentId,
    '#equipment-detail-status': item.equipmentStatusLabel,
    '#equipment-detail-last-opened': item.equipmentLastOpened,
    '#equipment-detail-cycle': item.equipmentCycle,
    '#equipment-detail-versions': item.equipmentVersions,
  };
  Object.entries(values).forEach(([selector, value]) => {
    const element = query(selector);
    if (element) element.textContent = value || '—';
  });
  const copy = query('[data-equipment-copy]', equipmentDialog);
  if (copy) copy.dataset.copyValue = item.equipmentId || '';
  equipmentDialog?.showModal();
}));

queryAll('[data-equipment-copy]').forEach((button) => button.addEventListener('click', (event) => {
  const value = event.currentTarget.dataset.copyValue;
  if (value) copyText(value, 'Identificador copiado.');
}));

async function submitEquipmentAction(button, action) {
  setBusy(button, true, 'Guardando…');
  try {
    await action();
    showToast('Cambios guardados.', 'success');
    window.setTimeout(() => window.location.reload(), 500);
  } catch (error) {
    setBusy(button, false);
    showToast(error.message, 'error');
  }
}

queryAll('[data-revoke]').forEach((button) => button.addEventListener('click', (event) => {
  const current = event.currentTarget;
  const id = current.dataset.revoke;
  if (!id || !window.confirm('¿Revocar esta instalación? Esta acción puede impedir nuevas aperturas.')) return;
  submitEquipmentAction(current, () => requestJson('/api/v1/admin/installations/' + encodeURIComponent(id) + '/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason: 'Revocación solicitada desde el panel' }),
  }));
}));

queryAll('[data-renew]').forEach((button) => button.addEventListener('click', (event) => {
  const current = event.currentTarget;
  const id = current.dataset.renew;
  const reason = id ? window.prompt('Motivo de la renovación:') : null;
  if (!id || !reason?.trim()) return;
  submitEquipmentAction(current, () => requestJson('/api/v1/admin/cycles/' + encodeURIComponent(id) + '/renew', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason: reason.trim() }),
  }));
}));

queryAll('[data-adjust]').forEach((button) => button.addEventListener('click', (event) => {
  const current = event.currentTarget;
  const id = current.dataset.adjust;
  const dueAt = id ? window.prompt('Nueva fecha de vencimiento (ISO 8601 UTC):') : null;
  const reason = dueAt ? window.prompt('Motivo del ajuste:') : null;
  if (!id || !dueAt || !reason?.trim()) return;
  submitEquipmentAction(current, () => requestJson('/api/v1/admin/cycles/' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ due_at: dueAt, reason: reason.trim() }),
  }));
}));

const ticketRows = queryAll('[data-ticket-row]');
const ticketSearch = query('#ticket-search');
const ticketStatus = query('#ticket-status');
const ticketResults = query('#ticket-results-count');
const ticketFilterEmpty = query('#ticket-filter-empty');

function filterTickets() {
  const search = (ticketSearch?.value || '').trim().toLowerCase();
  const status = ticketStatus?.value || 'all';
  let visible = 0;
  ticketRows.forEach((row) => {
    const matchesSearch = !search || row.dataset.ticketSearch.includes(search);
    const matchesStatus = status === 'all' || row.dataset.ticketStatus === status;
    const shown = matchesSearch && matchesStatus;
    row.classList.toggle('is-hidden', !shown);
    row.setAttribute('aria-hidden', shown ? 'false' : 'true');
    if (shown) visible += 1;
  });
  if (ticketResults) ticketResults.textContent = visible + (visible === 1 ? ' ticket visible' : ' tickets visibles');
  if (ticketFilterEmpty) ticketFilterEmpty.hidden = visible !== 0 || ticketRows.length === 0;
}

ticketSearch?.addEventListener('input', filterTickets);
ticketStatus?.addEventListener('change', filterTickets);
filterTickets();

const ticketDrawer = query('#ticket-drawer');
const ticketBackdrop = query('#ticket-drawer-backdrop');
const ticketFeedback = query('#ticket-drawer-feedback');
let selectedTicketId = '';

function closeTicketDrawer() {
  ticketDrawer?.classList.remove('is-open');
  ticketDrawer?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('drawer-open');
}

function openTicketDrawer(row) {
  selectedTicketId = row.dataset.ticketId || '';
  const values = {
    '#ticket-detail-title': row.dataset.ticketName,
    '#ticket-detail-team': row.dataset.ticketTeam,
    '#ticket-detail-description': row.dataset.ticketDescription,
    '#ticket-detail-id': row.dataset.ticketId,
    '#ticket-detail-created': row.dataset.ticketCreated,
    '#ticket-detail-email': row.dataset.ticketNotified === 'true' ? 'Notificación enviada' : 'Notificación pendiente',
  };
  Object.entries(values).forEach(([selector, value]) => {
    const element = query(selector);
    if (element) element.textContent = value || '—';
  });
  const status = query('#ticket-status-detail');
  if (status) status.value = row.dataset.ticketStatus || 'open';
  if (ticketFeedback) ticketFeedback.textContent = '';
  ticketDrawer?.classList.add('is-open');
  ticketDrawer?.setAttribute('aria-hidden', 'false');
  document.body.classList.add('drawer-open');
  query('#ticket-close')?.focus();
}

queryAll('[data-ticket-open]').forEach((button) => button.addEventListener('click', (event) => {
  const row = event.currentTarget.closest('[data-ticket-row]');
  if (row) openTicketDrawer(row);
}));
query('#ticket-close')?.addEventListener('click', closeTicketDrawer);
ticketBackdrop?.addEventListener('click', closeTicketDrawer);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && ticketDrawer?.classList.contains('is-open')) closeTicketDrawer();
});

query('#ticket-save')?.addEventListener('click', async (event) => {
  if (!selectedTicketId) return;
  const button = event.currentTarget;
  const status = query('#ticket-status-detail')?.value;
  setBusy(button, true, 'Guardando…');
  if (ticketFeedback) ticketFeedback.textContent = 'Guardando cambios…';
  try {
    await requestJson('/api/v1/admin/tickets/' + encodeURIComponent(selectedTicketId), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (ticketFeedback) ticketFeedback.textContent = 'Guardado correctamente.';
    showToast('Ticket actualizado.', 'success');
    window.setTimeout(() => window.location.reload(), 600);
  } catch (error) {
    setBusy(button, false);
    if (ticketFeedback) ticketFeedback.textContent = error.message;
    showToast(error.message, 'error');
  }
});
`;
