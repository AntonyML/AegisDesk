export const panelScript = `
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
