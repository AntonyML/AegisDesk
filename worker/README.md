# AegisDesk Worker

Worker de Cloudflare en TypeScript. El panel administrativo se sirve desde el
mismo Worker y queda protegido por Cloudflare Access. El código está separado
en `src/backend` (rutas, servicios, persistencia y seguridad) y `src/frontend`
(páginas, estilos, scripts y modelos de vista).

`src/index.ts` solo compone la aplicación y el cron. Las reglas de dominio se
encapsulan en clases como `CyclePolicy`, `EnrollmentService`, `ShellService`,
`AdminService` y `TicketService`; los adaptadores D1 viven en repositorios
dedicados.

## Desarrollo local

```powershell
npm ci
npm run types
npm run typecheck
npm test
npm run lint
npm run check
npm run verify
npm run deploy:dry
```

Los tests usan el runtime de Workers, D1 local y claves Ed25519 efímeras. No
usan la base D1 de producción ni envían correos reales.

Para `wrangler dev`, copiar `.dev.vars.example` a `.dev.vars` y reemplazar los
valores ficticios. `.dev.vars` no debe entrar al repositorio. La clave privada
`STATE_PRIVATE_KEY` es un secreto; nunca se coloca en `wrangler.jsonc`.

## Preparación de Cloudflare

1. Crear una base D1 y sustituir el `database_id` ficticio de
   `wrangler.jsonc`.
2. Aplicar la migración con `npx wrangler d1 migrations apply aegisdesk --remote`.
3. Cargar `STATE_PRIVATE_KEY` con `npx wrangler secret put STATE_PRIVATE_KEY`.
4. Configurar `STATE_KEY_ID`, `STATE_ISSUER`, `CONTACT_NAME`, `TICKET_URL`,
   `NOTIFY_FROM` y `NOTIFY_DESTINATION`.
5. Verificar `tonyml.com` en Resend y usar una API key con permiso de envío
   restringida al dominio. La API key se carga como secreto `RESEND_API_KEY`;
   nunca se pone en `wrangler.jsonc`.
6. Configurar Email Routing para que `soporte@tonyml.com` reenvíe al buzón real
   de soporte. Routing recibe y reenvía; Resend hace el envío desde el Worker.
7. Crear la aplicación de Cloudflare Access para `/panel` y las rutas
   `/api/v1/admin/*`; mantener la política limitada al grupo de soporte.
8. Crear la aplicación Turnstile y guardar `TURNSTILE_SECRET` como secreto;
   publicar la site key en `PUBLIC_TURNSTILE_SITE_KEY`.
9. Si la cuenta tiene disponible el binding de Rate Limiting, enlazarlo como
   `TICKET_RATE_LIMIT` para limitar la ruta pública por IP; Turnstile continúa
   siendo obligatorio y la ruta sigue funcionando sin ese binding.

Los valores `example.invalid`, el identificador D1 de ceros y las direcciones
de ejemplo son bloqueadores deliberados de despliegue. Se deben cambiar antes
de crear el primer código de enrolamiento.

## Desplegar cambios a producción

`git push` y el despliegue de Cloudflare son operaciones distintas. Para
publicar el Worker en el entorno configurado por `wrangler.jsonc`, usar:

```powershell
npm run deploy
```

Este comando ejecuta, en orden, typecheck, los tests integrados, lint y
`wrangler deploy --dry-run`; solo si todo pasa ejecuta `wrangler deploy`.
Usa la versión local de Wrangler declarada en `package.json`.

Antes del primer despliegue de producción deben existir en Cloudflare, dentro
del entorno **Producción**:

- Secreto `STATE_PRIVATE_KEY` con la clave privada Ed25519 en PKCS#8 PEM.
- Secreto `TURNSTILE_SECRET`.
- Secreto `RESEND_API_KEY`.
- Variables `STATE_ISSUER`, `STATE_KEY_ID`, `ACCESS_TEAM_DOMAIN`,
  `ACCESS_AUDIENCE`, `CONTACT_NAME`, `TICKET_URL`, `NOTIFY_FROM` y
  `NOTIFY_DESTINATION`.

El comando `npm run deploy` modifica el Worker remoto. Ejecutarlo solo cuando
los cambios locales ya estén revisados y las migraciones D1 estén aplicadas.
Los cambios de secretos con `wrangler secret put` también crean una versión y
la despliegan inmediatamente.

## Operación

El panel crea un código de enrolamiento de un solo uso. Soporte lo introduce en
la primera ejecución de AegisDesk junto con la ruta del ejecutable operativo de
SIDC. El Worker guarda únicamente hashes de los códigos y tokens permanentes.

El Worker firma el estado con Ed25519. La clave pública se incrusta en el shell
durante el build; una respuesta inválida se rechaza y el shell falla cerrado
según la política de caché y gracia. Los ciclos y eventos quedan en D1. El cron
diario aplica la configuración de retención: telemetría a 365 días, auditoría a
730 días, códigos vencidos a +7 días, tickets resueltos a 365 días, límites de
tasa a 1 día y anonimización de instalaciones revocadas a 365 días.

## Envío y recepción de correo

El flujo persiste el ticket antes de intentar enviar el correo mediante la API de
Resend. Si el envío falla, el ticket conserva `notified = false` para reintento
o gestión manual desde el panel. Email Routing puede reenviar `soporte@tonyml.com`
al buzón de soporte. Los tests nunca llaman a Resend.
