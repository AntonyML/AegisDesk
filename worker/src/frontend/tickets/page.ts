import { TICKET_CATEGORIES } from "../../shared/ticket-catalog";
import { escapeHtml } from "../shared/html";
import { ticketPageScript } from "./script";
import { ticketStyles } from "./styles";

const TICKET_TURNSTILE_ACTION = "ticket";

export function ticketPage(env: Env): Response {
  const siteKey = escapeHtml(env.PUBLIC_TURNSTILE_SITE_KEY || "");
  const privacyUrl = "/legal/privacy";
  const ticketCatalog = escapeHtml(JSON.stringify(TICKET_CATEGORIES));
  const categoryOptions = TICKET_CATEGORIES.map(
    ({ value, label }) =>
      `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`,
  ).join("");
  const hasTurnstile = siteKey && siteKey !== "replace-before-deploy";
  const turnstileScript = hasTurnstile
    ? `<script>window.aegisTurnstileWidgetId=null;window.aegisTurnstileReady=()=>{const container=document.querySelector("#turnstile-widget");if(container&&window.turnstile){window.aegisTurnstileWidgetId=window.turnstile.render(container,{sitekey:container.dataset.sitekey,action:container.dataset.action});}};</script><script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=aegisTurnstileReady&render=explicit" async defer></script>`
    : "";
  const widget = hasTurnstile
    ? `<div id="turnstile-widget" data-sitekey="${siteKey}" data-action="${TICKET_TURNSTILE_ACTION}" aria-label="Verificación de seguridad"></div>`
    : "";

  return new Response(
    `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Soporte Aegis</title>
  <style>${ticketStyles}</style>
  ${turnstileScript}
</head>
<body>
  <main>
    <h1>Soporte Aegis</h1>
    <p class="muted">Elegí el área y el problema observado. No hay un campo para escribir una descripción libre.</p>
    <form id="ticket-form" data-catalog="${ticketCatalog}" novalidate>
      <div>
        <label for="field-name">Nombre</label>
        <input id="field-name" name="name" maxlength="128" required aria-describedby="error-name">
        <span id="error-name" class="field-error" role="alert" aria-live="polite"></span>
      </div>
      <div>
        <label for="field-team">Equipo</label>
        <input id="field-team" name="team" maxlength="128" required aria-describedby="error-team">
        <span id="error-team" class="field-error" role="alert" aria-live="polite"></span>
      </div>
      <div>
        <label for="field-category">Área</label>
        <select id="field-category" name="category" required aria-describedby="error-category">
          <option value="">Seleccioná un área</option>
          ${categoryOptions}
        </select>
        <span id="error-category" class="field-error" role="alert" aria-live="polite"></span>
      </div>
      <div>
        <label for="field-issue_code">Problema observado</label>
        <select id="field-issue_code" name="issue_code" required disabled aria-describedby="error-issue_code">
          <option value="">Primero seleccioná un área</option>
        </select>
        <span id="error-issue_code" class="field-error" role="alert" aria-live="polite"></span>
      </div>
      ${widget}
      <div class="privacy-notice">
        Al enviar este formulario, recopilamos tu nombre, equipo y las opciones seleccionadas para atender la incidencia. No escribas contraseñas ni datos de terceros en los campos de nombre o equipo. Si no encontrás una opción adecuada, seleccioná “Otro problema” y usá el canal de soporte habitual; este formulario no admite explicaciones libres. Consultá el <a href="${privacyUrl}" target="_blank" rel="noopener noreferrer">Aviso de Privacidad</a>.
      </div>
      <button type="submit">Enviar ticket</button>
    </form>
  </main>
  <div id="ticket-toast" role="status" aria-live="polite" aria-atomic="true" hidden></div>
  <script>${ticketPageScript}</script>
</body>
</html>`,
    { headers: { "content-type": "text/html; charset=UTF-8" } },
  );
}
