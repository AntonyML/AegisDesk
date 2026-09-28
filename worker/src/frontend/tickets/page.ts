import { escapeHtml } from "../shared/html";
import { ticketPageScript } from "./script";
import { ticketStyles } from "./styles";

const TICKET_TURNSTILE_ACTION = "ticket";

export function ticketPage(env: Env): Response {
  const siteKey = escapeHtml(env.PUBLIC_TURNSTILE_SITE_KEY || "");
  const hasTurnstile = siteKey && siteKey !== "replace-before-deploy";
  const turnstileScript = hasTurnstile
    ? `<script>window.aegisTurnstileWidgetId=null;window.aegisTurnstileReady=()=>{const container=document.querySelector("#turnstile-widget");if(container&&window.turnstile){window.aegisTurnstileWidgetId=window.turnstile.render(container,{sitekey:container.dataset.sitekey,action:container.dataset.action});}};</script><script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=aegisTurnstileReady&render=explicit" async defer></script>`
    : "";
  const widget = hasTurnstile
    ? `<div id="turnstile-widget" data-sitekey="${siteKey}" data-action="${TICKET_TURNSTILE_ACTION}" aria-label="Verificación de seguridad"></div>`
    : "";
  return new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Soporte Aegis</title><style>${ticketStyles}</style>${turnstileScript}</head><body><main><h1>Soporte Aegis</h1><p class="muted">Describe el problema y el equipo donde ocurre. No envíes contraseñas ni datos de pacientes.</p><form id="ticket-form"><label>Nombre<input name="name" maxlength="128" required></label><label>Equipo<input name="team" maxlength="128" required></label><label>Descripción<textarea name="description" maxlength="4000" required></textarea>${widget}<button type="submit">Enviar ticket</button></form></main><div id="ticket-toast" role="status" aria-live="polite" aria-atomic="true" hidden></div><script>${ticketPageScript}</script></body></html>`,
    { headers: { "content-type": "text/html; charset=UTF-8" } },
  );
}
