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

query('#logout-button')?.addEventListener('click', () => {
  window.location.href = '/cdn-cgi/access/logout';
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
const equipmentForm = query('#equipment-form');
const equipmentOrganization = query('#equipment-organization');
const equipmentGroup = query('#equipment-group');
const equipmentUser = query('#equipment-user');
let selectedEquipmentId = '';

function localInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function syncEquipmentAssignments() {
  const organizationId = equipmentOrganization?.value || '';
  const groupId = equipmentGroup?.value || '';
  if (equipmentGroup) {
    Array.from(equipmentGroup.options).forEach((option) => {
      const visible = !option.value || option.dataset.organizationId === organizationId;
      option.hidden = !visible;
      option.disabled = !visible;
    });
    if (groupId && equipmentGroup.selectedOptions[0]?.disabled) equipmentGroup.value = '';
  }
  if (equipmentUser) {
    Array.from(equipmentUser.options).forEach((option) => {
      const sameOrganization = !option.value || option.dataset.organizationId === organizationId;
      const sameGroup = !groupId || !option.dataset.groupId || option.dataset.groupId === groupId;
      option.hidden = !(sameOrganization && sameGroup);
      option.disabled = !(sameOrganization && sameGroup);
    });
    if (equipmentUser.value && equipmentUser.selectedOptions[0]?.disabled) equipmentUser.value = '';
  }
}

equipmentOrganization?.addEventListener('change', syncEquipmentAssignments);
equipmentGroup?.addEventListener('change', syncEquipmentAssignments);
queryAll('[data-equipment-open]').forEach((button) => button.addEventListener('click', (event) => {
  const item = event.currentTarget.dataset;
  selectedEquipmentId = item.equipmentId || '';
  const values = {
    '#equipment-detail-name': item.equipmentName,
    '#equipment-detail-id': item.equipmentId,
    '#equipment-detail-last-opened': item.equipmentLastOpened,
    '#equipment-detail-versions': item.equipmentVersions,
    '#equipment-detail-sidc-target': item.equipmentSidcTarget,
    '#equipment-detail-assignment': [item.equipmentOrgId, item.equipmentGroupId, item.equipmentUserId].filter(Boolean).length ? 'Asignación configurada' : 'Sin asignación',
  };
  Object.entries(values).forEach(([selector, value]) => {
    const element = query(selector);
    if (element) element.textContent = value || '—';
  });
  const setValue = (selector, value) => { const element = query(selector); if (element) element.value = value || ''; };
  setValue('#equipment-id', item.equipmentId);
  setValue('#equipment-cycle-id', item.equipmentCycleId);
  setValue('#equipment-name', item.equipmentName);
  setValue('#equipment-status', item.equipmentStatus || 'active');
  setValue('#equipment-expires', localInputValue(item.equipmentDueAt));
  setValue('#equipment-organization', item.equipmentOrgId);
  syncEquipmentAssignments();
  setValue('#equipment-group', item.equipmentGroupId);
  syncEquipmentAssignments();
  setValue('#equipment-user', item.equipmentUserId);
  setValue('#equipment-reason', 'Cambio realizado desde el panel');
  const feedback = query('#equipment-feedback');
  if (feedback) feedback.textContent = '';
  const copy = query('[data-equipment-copy]', equipmentDialog);
  if (copy) copy.dataset.copyValue = item.equipmentId || '';
  equipmentDialog?.showModal();
}));

queryAll('[data-equipment-copy]').forEach((button) => button.addEventListener('click', (event) => {
  const value = event.currentTarget.dataset.copyValue;
  if (value) copyText(value, 'Identificador copiado.');
}));

equipmentForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = query('button[type=submit]', form);
  const feedback = query('#equipment-feedback');
  const values = Object.fromEntries(new FormData(form).entries());
  const status = values.status;
  if ((status === 'disabled' || status === 'revoked') && !window.confirm('¿Confirmás este cambio? El equipo recibirá una política que puede impedir abrir SIDC.')) return;
  setBusy(submit, true, 'Guardando…');
  if (feedback) feedback.textContent = 'Guardando cambios…';
  try {
    await requestJson('/api/v1/admin/installations/' + encodeURIComponent(values.id), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status, equipment_name: values.equipment_name, organization_id: values.organization_id || null, group_id: values.group_id || null, assigned_user_id: values.assigned_user_id || null, reason: values.reason }),
    });
    if (values.cycle_id && values.due_at) {
      const dueAt = new Date(values.due_at);
      if (Number.isNaN(dueAt.getTime())) throw new Error('La fecha de vencimiento no es válida.');
      await requestJson('/api/v1/admin/cycles/' + encodeURIComponent(values.cycle_id), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ due_at: dueAt.toISOString(), reason: values.reason }),
      });
    }
    if (feedback) feedback.textContent = 'Guardado correctamente.';
    showToast('Equipo actualizado.', 'success');
    window.setTimeout(() => window.location.reload(), 650);
  } catch (error) {
    setBusy(submit, false);
    if (feedback) feedback.textContent = error.message;
    showToast(error.message, 'error');
  }
});

queryAll('[data-revoke]').forEach((button) => button.addEventListener('click', (event) => {
  const current = event.currentTarget;
  const id = current.dataset.revoke;
  if (!id || !window.confirm('¿Revocar esta instalación? Esta acción puede impedir nuevas aperturas.')) return;
  requestJson('/api/v1/admin/installations/' + encodeURIComponent(id), { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'revoked', reason: 'Revocación solicitada desde el panel' }) }).then(() => window.location.reload()).catch((error) => showToast(error.message, 'error'));
}));

function formPayload(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  delete values.id;
  if (values.email === '') values.email = null;
  if (values.group_id === '') values.group_id = null;
  return values;
}

queryAll('[data-directory-edit]').forEach((button) => button.addEventListener('click', (event) => {
  const item = event.currentTarget.dataset;
  const form = query('[data-directory-form="' + item.directoryEdit + '"]');
  if (!form) return;
  form.elements.id.value = item.directoryId || '';
  form.elements.name && (form.elements.name.value = item.directoryName || '');
  form.elements.display_name && (form.elements.display_name.value = item.directoryName || '');
  form.elements.email && (form.elements.email.value = item.directoryEmail || '');
  form.elements.status && (form.elements.status.value = item.directoryStatus || 'active');
  form.elements.organization_id && (form.elements.organization_id.value = item.directoryOrganizationId || '');
  form.elements.group_id && (form.elements.group_id.value = item.directoryGroupId || '');
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}));

queryAll('[data-directory-reset]').forEach((button) => button.addEventListener('click', (event) => {
  const form = query('[data-directory-form="' + event.currentTarget.dataset.directoryReset + '"]');
  form?.reset();
  if (form?.elements.id) form.elements.id.value = '';
}));

queryAll('[data-directory-form]').forEach((form) => form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const type = form.dataset.directoryForm;
  const id = form.elements.id?.value;
  const submit = query('button[type=submit]', form);
  setBusy(submit, true, 'Guardando…');
  try {
    const path = type === 'organization' ? 'organizations' : type === 'group' ? 'groups' : 'managed-users';
    await requestJson('/api/v1/admin/' + path + (id ? '/' + encodeURIComponent(id) : ''), { method: id ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(formPayload(form)) });
    showToast('Cambio guardado.', 'success');
    window.setTimeout(() => window.location.reload(), 500);
  } catch (error) {
    setBusy(submit, false);
    showToast(error.message, 'error');
  }
}));

const supportForm = query('#support-form');
const supportFeedback = query('#support-feedback');
async function loadSupportForm() {
  if (!supportForm) return;
  try {
    const body = await requestJson('/api/v1/admin/support-config');
    const config = body.support_config;
    if (!config) return;
    Object.entries({ title: config.title, message: config.message, notice: config.notice, area_name: config.areaName, contact_email: config.contactEmail, contact_phone: config.contactPhone, hours: config.hours, ticket_url: config.ticketUrl, docs_url: config.docsUrl }).forEach(([name, value]) => { if (supportForm.elements[name]) supportForm.elements[name].value = value || ''; });
  } catch { /* La edición sigue disponible con valores por defecto. */ }
}
loadSupportForm();
supportForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = query('button[type=submit]', supportForm);
  setBusy(submit, true, 'Guardando…');
  if (supportFeedback) supportFeedback.textContent = 'Guardando cambios…';
  try {
    const values = formPayload(supportForm);
    if (values.contact_email === '') values.contact_email = null;
    if (values.contact_phone === '') values.contact_phone = null;
    if (values.ticket_url === '') values.ticket_url = null;
    if (values.docs_url === '') values.docs_url = null;
    await requestJson('/api/v1/admin/support-config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(values) });
    if (supportFeedback) supportFeedback.textContent = 'Guardado correctamente.';
    showToast('Soporte remoto actualizado.', 'success');
  } catch (error) {
    setBusy(submit, false);
    if (supportFeedback) supportFeedback.textContent = error.message;
    showToast(error.message, 'error');
  }
});

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
