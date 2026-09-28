# Diseño Fase 1 — AegisDesk

**Estado:** propuesta de diseño, sin código ni despliegue

**Fecha:** 2026-09-28

**Raíz provisional:** `C:\DEV\AegisDesk`

Este documento define un proyecto nuevo e independiente de SIDC y de
AegisSetup. AegisSetup termina su trabajo antes de que soporte abra AegisDesk.
La Fase 1 termina aquí. La Fase 2 —implementación— requiere
aprobación explícita del dueño.

## Nombres propuestos

| Nombre | Comentario | Recomendación |
| --- | --- | --- |
| **AegisDesk** | Nombre profesional, vinculado con el ecosistema Aegis sin llamarse igual que el instalador. | **Sí; adoptar como nombre provisional y de trabajo.** |
| SIDC-Launcher | Describe exactamente el cascarón y es fácil de reconocer en una PC. | Buena alternativa técnica, pero menos de producto. |
| SIDC-Relay | Destaca que el programa intermedia entre el acceso directo y SIDC. | Alternativa válida si se quiere enfatizar la intermediación. |

En lo que sigue uso `AegisDesk`. El nombre definitivo es una decisión
abierta, no una dependencia técnica.

## Principios no negociables

1. El ejecutable original de SIDC y sus plantillas no se modifican.
2. En operación normal, SIDC se intenta abrir siempre, aunque no haya red, el
   Worker falle o el estado local esté ausente. La única excepción explícita es
   un estado `expired` firmado por el Worker: en ese caso se muestra la puerta
   de consentimiento de mantenimiento y el usuario debe aceptarla para
   continuar.
3. El shell no calcula fechas, no contiene reglas de mantenimiento y no decide
   la severidad de un aviso. Solo muestra una respuesta firmada y ejecuta el
   destino configurado.
4. El Worker es la fuente de verdad para hora, ciclos, avisos, tickets,
   revocaciones y autenticación de instalación.
5. La telemetría es mínima, explícita y auditable. No se recogen teclas,
   pantallas, documentos, contenido de SIDC ni cadenas de conexión.
6. AegisDesk es independiente de AegisSetup. AegisSetup prepara SIDC; soporte
   abre AegisDesk después y completa su propio asistente inicial.
7. Todo cambio posterior se implementará con tests integrados; no se acepta un
   hito que solo pase pruebas unitarias.

## 1. Hallazgos de la revisión en lectura

### AegisSetup

La revisión se hizo solo en lectura sobre `C:\DEV\SIDC\AegisSetup`.

- Es un repositorio Go independiente y anidado dentro de SIDC. El módulo actual
  es `aegis-setup` y declara Go `1.27.0`.
- La estructura que conviene reutilizar es `cmd/` para entradas, `internal/`
  para lógica, `assets/` para recursos, `docs/` para runbooks y `scripts/` para
  automatización. El proyecto tiene pruebas Go distribuidas por paquete.
- `build.ps1` ejecuta el gate de formato de los archivos relevantes, `go vet`,
  tests, compilación Linux y la compilación limpia del binario. También admite
  inyectar la versión mediante `-ldflags` y, opcionalmente, compilar el
  instalador Inno Setup.
- `.github/workflows/release.yml` trabaja con tags `v*`, calcula una versión
  semántica, ejecuta `vet`, tests y build Linux, compila el binario Windows y
  publica assets. Esa secuencia es una buena referencia para el shell.
- `installer.iss` usa Inno Setup, genera `AegisSetup-Setup-v<versión>.exe`,
  crea accesos directos y requiere administrador solo para la instalación.
- Los nombres ya establecidos para artefactos de SIDC son
  `*_ORIGINAL.exe` para la referencia de fábrica y
  `*_AegisSetup.exe`/`*_Docker_AegisSetup_v<versión>.exe` para generados. Los
  originales deben permanecer intactos.
- La documentación de AegisSetup usa español con voseo costarricense. Se
  reutilizará ese tono en textos operativos, pero el shell no mostrará errores
  técnicos al usuario.
- En el checkout consultado, AegisSetup estaba limpio y en `main`. Esto no
  coincide con el estado histórico anotado en `docs/agents/STATUS.md`, que
  describe ramas de trabajo de una sesión anterior. La implementación deberá
  volver a verificar la rama y el commit antes de integrar cambios; no se toma
  el estado del documento como evidencia actual.

### SIDC y la carpeta viva

- SIDC es VB6, no hay código fuente y el runtime es de 32 bits. AegisSetup
  conoce rutas, DSN, Crystal y OCX, pero el nuevo shell no debe asumir esas
  responsabilidades.
- `C:\DEV\SIDC` sigue siendo la instalación viva. El shell se instala fuera de
  esa carpeta, preferiblemente en `C:\Program Files\AegisDesk\`; el estado
  mutable va en `C:\ProgramData\AegisDesk\` con ACL explícita.
- En `C:\DEV\SIDC` se conservan el original de fábrica y el ejecutable
  generado que AegisSetup haya aprobado. Los artefactos viejos anteriores a
  `legacy` se archivan únicamente con fecha en el nombre. El shell no mueve ni
  borra nada de esa carpeta.
- El “exe original de SIDC” en este diseño significa el ejecutable de SIDC que
  AegisSetup deja como destino operativo. No significa el archivo de referencia
  `*_ORIGINAL.exe`, que nunca debe ser el objetivo del acceso directo en una
  instalación normal.

### Referencias externas verificadas para el diseño

Las cifras del free tier deben volver a verificarse antes de desplegar, porque
Cloudflare puede modificarlas:

- Workers Free: 100.000 requests diarios y 10 ms de CPU por invocación.
- D1 Free: 5 millones de filas leídas y 100.000 filas escritas por día, 5 GB
  de almacenamiento total y 500 MB por base; una invocación tiene hasta 50
  subconsultas D1 bajo el límite de Workers.
- Zero Trust Free/Access: pensado para equipos de hasta 50 usuarios. El panel
  debe reservarse a administradores, no a todas las personas que abren SIDC.
- Turnstile tiene plan gratuito, hasta 20 widgets y validación obligatoria en
  servidor.

El correo previsto usa el binding `send_email` de Cloudflare, con un único
destino administrativo verificado. No se incorpora un proveedor de correo ni
una API key al shell.

## H0. Informe corto de reutilización

H0 es un spike de como máximo un día antes de escribir código de producto. En
esta Fase 1 se revisaron las referencias públicas; no se copió código ni se
incorporó ninguna dependencia al proyecto. La decisión provisional es reutilizar
patrones, no hacer un fork completo.

| Candidato | Qué se puede reutilizar | Qué se descarta | Decisión H0 |
| --- | --- | --- | --- |
| [`Screenata/open-attest`](https://github.com/Screenata/open-attest) | La separación Worker/D1/Drizzle, el patrón de enrolamiento por token, el heartbeat/evento mínimo, la superficie administrativa protegida por Access y sus convenciones de despliegue, si el código confirma que son adecuadas. | El agente Rust residente, la recolección de postura (hardware, aplicaciones, contraseñas y controles del equipo), la SPA React, la lógica SOC2/attestation y cualquier idea de licenciamiento o bloqueo. AegisDesk solo necesita avisos, mantenimiento y telemetría mínima. | **Referencia, no dependencia ni fork.** El repositorio declara MIT y documenta Worker + D1 + Drizzle, pero su agente y su alcance de privacidad no corresponden. Tiene 76 commits y no presenta releases públicas en la vista revisada; la cadencia de mantenimiento debe verificarse clonando y fijando un commit antes de copiar una línea. |
| Hono + Drizzle + D1 | Hono para rutas y HTML; Drizzle para esquema/migraciones y acceso D1; starters oficiales solo como referencia de configuración. | Una capa de repositorios/servicios innecesaria, endpoints sin validación y cualquier starter que arrastre una SPA. | **Adoptar.** Hono con JSX/htmx y CSS ligero; Drizzle directo en handlers finos; Zod para entradas; Biome para formato/lint. |
| `ncruces/zenity` | Sus diálogos Go para mensaje, entrada, selección de archivo, pregunta y progreso. Su paquete no requiere cgo y documenta soporte Windows. | Depender del ejecutable externo `zenity`, resolver lógica de negocio en la UI o asumir que todos los diálogos se comportan igual en sesiones no interactivas. | **Spike obligatorio antes de H2.** La página pública muestra soporte Windows, MIT y tests, pero también diferencias y limitaciones de comportamiento; se debe probar ventana en segundo plano, DPI, cancelación, cierre y accesibilidad en las versiones de Windows objetivo. |
| `jose` / `golang-jwt` | JWT EdDSA estándar: `jose` en Workers y `golang-jwt/jwt/v5` en Go, con claims de expiración, audiencia, emisor, sujeto y `kid`. | Canonicalización propia, formatos de firma inventados y claves públicas entregadas por la red. | **Adoptar con versiones fijadas.** Las bibliotecas verifican JOSE/JWT, pero la política de claims y el uso fail-open siguen siendo responsabilidad de AegisDesk. |

### Resultado H0 y criterio para copiar

Antes de H1 se comprobarán en un checkout temporal: licencia exacta, commit
actual, tests, instrucciones de despliegue y compatibilidad de las piezas que se
pretendan copiar. Cualquier fragmento copiado conservará atribución y quedará
fijado a un commit; si el spike no demuestra mantenimiento o calidad suficiente,
se implementará el contrato propio de AegisDesk usando las APIs oficiales. No
se copiarán el agente, la SPA, el modelo de attestation ni la recolección de
postura de `open-attest`.

La fuente de verdad del panel será Cloudflare Access. La primera configuración
del shell no tendrá login de usuario y contraseña: el administrador generará un
código de enrolamiento de un solo uso desde el panel Access y soporte lo
introducirá una vez en el shell.

## 2. Arquitectura y flujo shell ↔ Worker

### Árbol propuesto (todavía no creado)

```text
AegisDesk/
├── shell/                         # exe Windows, Go, lógica mínima
│   ├── cmd/aegisdesk/             # entrada del proceso
│   ├── internal/
│   │   ├── state/                 # Resolve, JWT, caché y telemetría
│   │   ├── launch/                # ejecución del destino SIDC
│   │   └── ui/                    # diálogos y botón de contacto
│   ├── testdata/                  # fixtures firmados sin datos reales
│   ├── go.mod
│   ├── build.ps1
│   ├── installer.iss
│   └── README.md
├── worker/                        # Worker TS, panel embebido y contratos
│   ├── src/
│   │   ├── index.ts               # router HTTP
│   │   ├── enrollment.ts          # códigos de un solo uso y tokens
│   │   ├── cycles.ts              # reloj y ciclos persistidos
│   │   ├── notices.ts             # avisos que devuelve el Worker
│   │   ├── signing.ts             # JWT EdDSA con jose
│   │   ├── events.ts              # aperturas, consentimientos y acciones
│   │   ├── tickets.ts             # formulario, Turnstile y send_email
│   │   └── panel/                 # HTML/CSS/TS inyectado en el Worker
│   ├── migrations/                # migraciones D1
│   ├── tests/                     # Vitest + pool Workers + D1 local
│   ├── package.json
│   ├── wrangler.toml
│   └── README.md
└── docs/
    └── diseno.md
```

El árbol es una propuesta documental. En Fase 1 no se crean esos archivos.

El Worker se implementará en **TypeScript** con Wrangler. El panel no será un
proyecto web separado: el Worker devolverá su HTML y CSS, y servirá el
TypeScript del panel desde el mismo despliegue. La separación en `src/panel/`
solo organiza el código fuente; no implica otro backend ni Supabase.

### Componentes

| Componente | Responsabilidad | No debe hacer |
| --- | --- | --- |
| Shell | Primera configuración, pedir estado, verificar firma, mostrar avisos, abrir contacto, crear el acceso directo, lanzar SIDC y enviar telemetría mínima. | Calcular plazos, tomar decisiones de negocio, elevarse, inspeccionar pantallas o datos de SIDC. |
| Worker | Hora del servidor, autenticación propia, enrolamiento, ciclos, avisos, revocación, persistencia, tickets, panel y firma. | Bloquear el arranque por falta de red o por una respuesta no firmada. |
| D1 | Fuente persistente y transaccional de equipos, códigos, ciclos, eventos y tickets. | Servir como caché de baja latencia. |
| KV | No se usa para decisiones de negocio en la primera versión. | Guardar ciclos, revocaciones, tokens o estado autoritativo. |
| AegisSetup | Terminar la instalación y configuración manual de SIDC. Es un prerrequisito, no una dependencia de ejecución. | Instalar AegisDesk, provisionar sus credenciales o duplicar sus reglas. |
| Cloudflare Access | Proteger panel y endpoints administrativos. | Dar acceso administrativo al shell o servir como contraseña dentro del shell. |

### Superficie mínima del shell

El shell se limita a `cmd/` y tres paquetes pequeños: `state` (cliente HTTP,
verificación JWT, caché de un archivo, resolución fail-open y envío de eventos),
`ui` (adaptador sobre `ncruces/zenity`) y `launch` (ruta absoluta, proceso y
resultado). La versión se inyecta con `-ldflags`. `ui` expone interfaces para
mensaje, entrada de código, selección de archivo, progreso, pregunta y apertura
del navegador mediante `pkg/browser`; la lógica de negocio permanece en `state`
y `main` solo coordina el estado resultante.

El patrón central es `Resolve(ctx) State`: intenta red con deadline de 2–3 s,
verifica el JWT y guarda la última respuesta válida; si falla usa la caché
firmada; si no existe, devuelve un estado seguro por defecto. Solo un estado
`expired` firmado/cached puede pedir consentimiento antes de lanzar SIDC. No se
propaga el error de red hacia la UI ni se usa un error del shell como decisión
de negocio.

### Apertura normal

1. El soporte instala y configura SIDC con AegisSetup. Después abre
   `AegisDesk.exe` manualmente por primera vez; AegisSetup no instala ni
   configura AegisDesk.
2. En el primer arranque, el shell muestra un asistente y pide el código de
   enrolamiento de un solo uso que soporte generó previamente en el panel
   protegido por Cloudflare Access. No pide ni guarda usuario y contraseña. El
   Worker consume el código, crea un token de instalación revocable y devuelve
   una configuración firmada.
3. Si no hay ruta local configurada, el asistente permite elegir la ubicación
   del ejecutable operativo de SIDC mediante selector de archivo o escribir su
   ruta local. Es una ruta de Windows, no una URL web. Se guarda la ruta
   absoluta, se valida que el archivo exista y se registra la versión declarada.
   No se busca ni se elige automáticamente otro `.exe`.
4. El shell guarda su configuración y token en `C:\ProgramData\AegisDesk\`, con
   ACL de máquina. La contraseña, la sesión de alta y cualquier token temporal
   quedan fuera de ese archivo.
5. El shell crea un acceso directo en el Escritorio con nombre visible
   **“SIDC”** —o el nombre final aprobado—, icono moderno y profesional, target
   `AegisDesk.exe`, ruta de trabajo configurada y sin parámetros sensibles.
6. En los arranques siguientes, el usuario activa ese acceso directo. El shell
   carga la configuración local y hace `POST /api/v1/shell/state` con timeout
   total de 2–3 s. No pide usuario y contraseña otra vez salvo que el token haya
   sido revocado o la configuración se haya perdido.
7. En paralelo, abre una ventana pequeña y no modal durante aproximadamente
   tres segundos. El texto base es: **“¿Hay algún error? Contacta con
   [NOMBRE]”**. El nombre y la URL de tickets vienen del Worker cuando hay
   respuesta válida; la configuración local contiene un respaldo de contacto.
8. Si la respuesta es válida, verifica firma, `install_id`, versión de contrato,
   vigencia y `key_id`. Guarda como máximo la última respuesta firmada y muestra
   los avisos que ella contiene.
9. Si no hay red o la respuesta no pasa verificación, lee la última respuesta
   firmada en caché. Si no existe, muestra solo la ventana de contacto base y
   registra el detalle técnico en el log local.
10. Si el Worker entrega `expired` firmado, el shell no continúa automáticamente:
    muestra la puerta de mantenimiento descrita abajo. Si el estado no es
    `expired`, al vencer el temporizador corto ejecuta SIDC con ruta absoluta y
    termina.
11. La telemetría de apertura y de la decisión de consentimiento se envía de
    forma best effort con deadline corto. Si falla, no se reintenta bloqueando al
    usuario, salvo la decisión ya tomada por la puerta de mantenimiento.

### Puerta de mantenimiento vencido

El Worker devuelve `expired` únicamente cuando el ciclo persistido está vencido.
La respuesta firmada incluye `requires_consent: true`, el texto aprobado,
`countdown_seconds: 5` y el contacto de soporte. El shell no calcula el plazo ni
decide cuándo activar la puerta. La apariencia puede recordar a un CAPTCHA, pero
no es un CAPTCHA ni una verificación de identidad: es una puerta local de
consentimiento con cuenta regresiva.

- La puerta es un modal bloqueante, visualmente claro e incómodo, pero no oculta
  el motivo ni intenta engañar al usuario.
- Texto propuesto: **“El mantenimiento de este equipo está vencido. Podés
  continuar bajo tu consentimiento; el soporte no se hace responsable por
  operar sin mantenimiento.”** El texto final debe ser aprobado por la
  organización.
- Primero muestra una cuenta regresiva visible `5`, `4`, `3`, `2`, `1` durante
  cinco segundos. Después presenta la pregunta y dos acciones: **“Acepto”** y
  **“Cancelar”**. No se usa un CAPTCHA ni un checkbox que pretenda probar la
  identidad; la confirmación es un consentimiento explícito para ese arranque.
- No se puede cerrar con `Esc`, la X ni un clic fuera del modal durante la
  decisión. Si la persona cancela o abandona el proceso, el shell registra
  `consent_declined` y no abre SIDC en ese intento. Esta es la única excepción
  deliberada a la regla de apertura automática y debe ser visible en la política
  institucional.
- La puerta aparece en cada apertura del cascarón mientras el Worker siga
  devolviendo `expired`; no existe un “recordar mi decisión” local.
- Si el Worker no responde y la caché firmada más reciente no indica `expired`,
  se mantiene el comportamiento fail-open y SIDC abre. Si la caché firmada ya
  indica `expired`, se puede mostrar la misma puerta porque el estado fue
  emitido por el Worker; no se crean fechas nuevas localmente.

### Botón de contacto

- Abre la URL HTTPS del formulario en el navegador predeterminado.
- No ejecuta comandos, no usa rutas construidas desde texto del ticket y no
  solicita elevación.
- La ventana se cierra sola; el botón no es modal y no captura el teclado.
- Si el Worker entrega una severidad, el shell solo aplica estilo visual y
  muestra el texto recibido. No transforma “warning” en “expired” ni calcula
  cuánto falta.

### Falla de lanzamiento

Si `CreateProcess`/equivalente no puede iniciar SIDC, el shell solo escribe un
log local con código de error, versión y destino ya normalizado. No muestra una
alerta técnica. El botón de contacto sigue disponible; la telemetría marca
`launch_result: "failed"` si logra llegar al Worker.

### Distribución, accesos directos y actualización

- El release del shell publica un instalador Windows firmado, por ejemplo
  `AegisDesk-Setup-v<versión>.exe`, y un hash de verificación. El portable no se
  usa como mecanismo normal de distribución en las terminales.
- Después de que soporte termina AegisSetup, ejecuta el instalador independiente
  de AegisDesk. Este instala el shell en `C:\Program Files\AegisDesk\` y crea
  el estado mutable en `C:\ProgramData\AegisDesk\`. No copia nada a
  `C:\DEV\SIDC`.
- En el primer arranque, AegisDesk pide usuario/contraseña, permite elegir el
  ejecutable de SIDC, enrola la instalación y escribe la configuración local.
  No depende de una configuración interna de AegisSetup ni crea una nueva regla
  de mantenimiento en SIDC.
- AegisDesk crea o actualiza los accesos directos de Escritorio y Menú Inicio
  para que `Target` sea el shell, `WorkingDirectory` sea la raíz aprobada de
  SIDC y el icono sea el acordado. El acceso visible se llama `SIDC` y ningún
  acceso directo de soporte debe seguir apuntando directamente al ejecutable
  operativo de SIDC.
- El shell recibe la ruta absoluta del objetivo desde la configuración instalada
  y la valida. No busca cualquier `.exe` en la carpeta ni usa el nombre recibido
  desde un ticket o desde una respuesta no firmada.
- Para actualizar, el operador ejecuta la nueva versión del instalador firmado
  de AegisDesk. El proceso verifica firma y hash, conserva una copia versionada
  del shell anterior fuera de `C:\DEV\SIDC`, instala de forma atómica y deja un
  rollback claro. El shell no se autoactualiza con privilegios ni descarga y
  ejecuta un binario por su cuenta.
- Si falla la red durante una actualización, la versión instalada sigue
  funcionando; la política de fail-open del shell no se usa para aceptar un
  binario nuevo sin verificar.
- La prueba de integración inspecciona los `.lnk` de ambos destinos, abre el
  shell por el acceso directo y confirma que SIDC arranca. También comprueba que
  `_ORIGINAL.exe`, reportes y archivos de `legacy\` no se movieron.

## 3. Contrato de la API

### Reglas comunes

- Base: `https://<dominio-controlado>/api/v1`.
- `v1` es la versión mayor del contrato. Cambios incompatibles crean `v2`.
- JSON UTF-8, fechas ISO 8601 en UTC, IDs UUIDv4 y cuerpos limitados por ruta.
- Durante el primer arranque, el shell usa HTTPS para enviar un código de
  enrolamiento de un solo uso únicamente a `/shell/enroll`.
- Después del alta, el shell usa `Authorization: Bearer <token-de-instalación>`
  solo contra los endpoints de shell. El token no se escribe en logs ni se
  devuelve al panel.
- Cada POST lleva `Idempotency-Key` cuando pueda repetirse.
- Errores del shell son locales. El Worker devuelve códigos HTTP y un código
  estable, nunca una traza ni un secreto.

### Autenticación de administración y enrolamiento

No se usará Supabase ni un login propio en D1. Cloudflare Access protege el
panel y sus endpoints administrativos. Un administrador autenticado genera
`enrollment_code` con vencimiento corto y un solo uso. El código se muestra una
sola vez y se almacena en D1 únicamente como hash; soporte lo introduce en el
shell durante la configuración inicial. Así, el shell nunca conoce la
contraseña del panel y el Worker no necesita KDF, usuarios propios, sesiones ni
bloqueo progresivo.

`POST /api/v1/admin/enrollment-codes` (Access)

Respuesta conceptual:

```json
{
  "code": "<codigo-de-un-solo-uso>",
  "expires_at": "2026-09-28T19:00:00Z"
}
```

El panel registra el actor de Access que creó el código. El endpoint de
enrolamiento compara el hash en una transacción, comprueba vigencia y marca el
código como usado antes de crear la instalación. Un retry no puede consumirlo
dos veces.

### Enrolamiento de una instalación

`POST /api/v1/shell/enroll`

Se usa una sola vez durante la primera configuración. AegisSetup no participa
en este enrolamiento.

Header: `Authorization: Enrollment <codigo-de-un-solo-uso>`.

Solicitud conceptual:

```json
{
  "protocol_version": 1,
  "shell_version": "1.0.0",
  "sidc_version": "2.01.0300",
  "equipment_name": "<nombre visible del equipo>",
  "sidc_target": "C:\\DEV\\SIDC\\<exe operativo>"
}
```

Respuesta `201`:

```json
{
  "install_id": "<uuid>",
  "installation_token": "<token opaco; se muestra una sola vez>",
  "shell_config": {
    "worker_base_url": "https://<dominio>",
    "sidc_target": "C:\\DEV\\SIDC\\<exe operativo>",
    "equipment_name": "<nombre visible del equipo>",
    "contact_name": "[NOMBRE]",
    "ticket_url": "https://<dominio>/tickets",
    "protocol_version": 1
  }
}
```

El Worker guarda únicamente un hash del token. AegisDesk lo almacena en una
ubicación con ACL; el valor en claro no aparece en el repositorio ni en logs.

### Estado firmado

`POST /api/v1/shell/state`

Solicitud:

```json
{
  "protocol_version": 1,
  "install_id": "<uuid>",
  "open_id": "<uuid>",
  "shell_version": "1.0.0",
  "sidc_version": "2.01.0300"
}
```

El Worker obtiene `server_time` de su propio reloj y calcula los avisos a partir
de D1. Respuesta `200`:

```json
{
  "state_token": "<JWT compacto firmado con EdDSA>"
}
```

El Worker firma el JWT con `jose`; el shell lo verifica con
`golang-jwt/jwt/v5`. No se implementa canonicalización propia ni se acepta una
clave pública recibida por la red como autoridad. El header y payload mínimos
son:

```json
{
  "alg": "EdDSA",
  "typ": "JWT",
  "kid": "ed25519-2026-01"
}
```

```json
{
  "iss": "https://<dominio-controlado>",
  "aud": "aegisdesk-shell-v1",
  "sub": "<install_id>",
  "jti": "<uuid>",
  "iat": 1790618400,
  "nbf": 1790618400,
  "exp": 1791223200,
  "protocol_version": 1,
  "server_time": "2026-09-28T18:00:00Z",
  "cache_until": "2026-10-05T18:00:00Z",
  "contact": {"name": "[NOMBRE]", "ticket_url": "https://<dominio>/tickets"},
  "notices": []
}
```

`notices` contiene `id`, `severity`, `frequency`, `title`, `message`,
`closable`, `requires_consent` y `countdown_seconds`. Cuando el ciclo está
vencido incluye `severity: "critical"`, `frequency: "each_open_after_expiry"`,
`closable: false`, `requires_consent: true` y `countdown_seconds: 5`. El shell
valida `iss`, `aud`, `sub`, `exp`, `nbf`, `kid` y `protocol_version`. Las claves
públicas se embeben por `kid`; una versión puede llevar la actual y la anterior
durante una rotación. El JWT no cifra datos: el payload solo puede contener el
texto operativo aprobado y datos no sensibles.

### Eventos de apertura, consentimiento y administración

`POST /api/v1/shell/events`

```json
{
  "protocol_version": 1,
  "open_id": "<uuid>",
  "type": "opening",
  "windows_user": "<usuario local, sin contraseña ni perfil>",
  "equipment_name": "<nombre visible del equipo>",
  "shell_version": "1.0.0",
  "sidc_version": "2.01.0300",
  "consent_state": "not_required",
  "launch_result": "success"
}
```

El Worker guarda `server_received_at` como fecha oficial. No se guarda IP,
hostname completo, MAC, pantalla, proceso, teclas, documentos, consulta SQL ni
contenido de SIDC. `launch_result` solo admite `success`, `failed` o
`not_attempted`; `consent_state` admite `not_required`, `required`, `accepted` o
`declined`; y el shell no envía rutas internas en caso de error. Los eventos de
consentimiento (`consent_required`, `countdown_completed`, `consent_accepted`,
`consent_declined`) y las acciones administrativas usan esta misma tabla. El
Worker fija `server_received_at` y el actor de Access cuando corresponda.

### Tickets públicos

`GET /tickets` sirve el formulario estático.

`POST /api/v1/tickets` recibe únicamente:

```json
{
  "name": "Nombre de la persona",
  "team": "Equipo o área",
  "description": "Descripción del problema",
  "turnstile_token": "<token de Turnstile>",
  "idempotency_key": "<uuid>"
}
```

El Worker valida longitudes, contenido y Turnstile en servidor, persiste primero
el ticket y después intenta enviar el correo mediante el binding `send_email`.
Respuesta normal `202`: `{"ticket_id":"<uuid>","notified":true}`. La persona
recibe un folio, no el contenido de un error del Worker.

### Panel protegido

Access protege `/panel/*` y `/api/v1/admin/*`. El Worker valida el JWT de Access
(issuer, audiencia, firma y expiración) como defensa en profundidad y aplica un
rol administrativo antes de cualquier mutación.

Endpoints mínimos:

| Método y ruta | Uso |
| --- | --- |
| `GET /api/v1/admin/installations` | Equipos, estado, última apertura y revocación. |
| `GET /api/v1/admin/events` | Filtrado por equipo, fechas, versión, tipo y resultado. |
| `POST /api/v1/admin/enrollment-codes` | Crear código de alta de un solo uso. |
| `POST /api/v1/admin/cycles/:id/renew` | Crear un nuevo ciclo por decisión explícita. |
| `PATCH /api/v1/admin/cycles/:id` | Ajustar fecha/duración, con motivo obligatorio. |
| `POST /api/v1/admin/installations/:id/revoke` | Revocar token y registrar motivo. |
| `GET /api/v1/admin/tickets` | Listar y filtrar tickets. |
| `PATCH /api/v1/admin/tickets/:id` | Cambiar estado y nota interna. |
| `GET /api/v1/admin/audit` | No existe una tabla aparte: filtra `events` por `actor` y tipos administrativos. |

Los endpoints de ciclo no aceptan una operación “reset all” ni crean un ciclo al
leer estado. Toda renovación registra quién, cuándo, valor anterior, valor nuevo
y motivo.

### Versiones y compatibilidad

- El shell declara `protocol_version` y rechaza una respuesta mayor que no
  conozca, pero abre SIDC usando caché o modo silencioso.
- El Worker mantiene durante al menos una versión la forma anterior de los
  campos no críticos.
- El JWT contiene `protocol_version`, `sub`, `iat`, `exp` y los avisos, así una
  respuesta de un equipo no se puede trasplantar a otro ni usar indefinidamente.
- La versión del shell se inyecta en build, siguiendo la convención de AegisSetup;
  la versión de SIDC se instala como dato declarado por AegisSetup, no se
  reconstruye inspeccionando el ejecutable legado.

## 4. Modelo de datos

### Elección: D1 como autoridad; KV solo como caché

Se recomienda **D1** porque este sistema tiene relaciones, filtros, renovaciones,
eventos, estados de tickets y operaciones que deben ser transaccionales. KV es
eventualmente consistente y sirve mejor para contenido estático o caché; no debe
decidir si un token fue revocado ni si ya existe un ciclo. La primera versión no
usa KV ni Durable Objects.

No se requiere Durable Object en la primera versión: el volumen esperado es bajo
y D1 simplifica consultas y exportación. Si la concurrencia de renovaciones o
enrolamientos lo exigiera, se puede añadir un objeto por operación sin cambiar el
contrato público.

### Tablas

| Tabla | Campos principales | Reglas |
| --- | --- | --- |
| `installations` | `id`, `token_hash`, `equipment_name`, `sidc_target`, `created_at`, `revoked_at`, `shell_version`, `sidc_version`, `last_opened_at`, `status` | `id` único; token nunca en claro; revocación idempotente. La ruta se trata como dato de configuración, no como comando. |
| `enrollment_codes` | `id`, `code_hash`, `created_at`, `expires_at`, `used_at`, `created_by` | Uso único, expiración corta y hash del código; nunca guardar el código. |
| `cycles` | `id`, `installation_id`, `started_at`, `duration_months`, `due_at`, `status`, `created_by`, `reason` | Una fila activa por equipo; `due_at` se persiste y nunca se regenera al reiniciar. |
| `events` | `id`, `installation_id`, `cycle_id`, `open_id`, `server_received_at`, `type`, `actor`, versiones, `windows_user`, `consent_state`, `launch_result`, `payload_json` mínimo | Única bitácora de aperturas, consentimientos y acciones administrativas. `open_id` e idempotency key evitan duplicados; los avisos se infieren de estos eventos. |
| `tickets` | `id`, `created_at`, `name`, `team`, `description`, `status`, `notified`, `notified_at` | El ticket se conserva aunque falle el correo; `notified` es un resultado best effort. |

Índices mínimos: `installations.status`, `installations.last_opened_at`,
`enrollment_codes.expires_at`, `cycles.due_at`, `events.installation_id +
server_received_at`, `events.type + server_received_at` y
`tickets.status + created_at`. Un Cron Trigger semanal elimina `events` con más
de 12 meses; tickets, instalaciones y ciclos siguen la retención institucional.

### Retención propuesta

- Eventos detallados: 12 meses; después, conservar solo contadores mensuales
  agregados si la organización los necesita.
- Tickets: 24 meses o el período institucional que se acuerde; no borrar un
  ticket abierto.
- Las acciones administrativas viven en `events`; conservarlas 24 meses como
  mínimo si la organización lo requiere, o ajustar la política antes de activar
  el Cron.
- Ciclos, instalaciones y revocaciones: mientras el equipo sea operativo más un
  período de respaldo definido por la organización.

La retención es una decisión de gobierno, no una manera de eludir la capacidad
gratuita. El panel debe mostrarla y permitir exportación administrativa antes de
depurar.

## 5. Algoritmo del plazo aleatorio y anti-manipulación

### Creación del ciclo

1. En el primer enrolamiento, el Worker toma `started_at = server_now`.
2. Genera un entero criptográficamente aleatorio sin usar reloj del cliente.
3. Elige uniformemente un número de meses entre 2 y 6 inclusive. El mes nominal
   de referencia es 3; los otros cuatro valores introducen la variación pedida.
4. Calcula `due_at` con suma de meses calendario en UTC y persiste en la misma
   transacción la instalación y el ciclo.
5. Guarda `duration_months`, `started_at` y `due_at`. El valor aleatorio no se
   vuelve a generar al reiniciar el Worker, leer estado o abrir SIDC.

Para evitar sesgo de módulo, el código futuro deberá usar rechazo: descarta una
muestra aleatoria fuera del mayor múltiplo de 5 que quepa en el espacio de la
fuente y vuelve a tomar otra. Una prueba de propiedad comprobará siempre
`2 <= duration_months <= 6` y que el valor persistido se conserva tras recargar
la base.

### Renovación y ajuste

- Solo el panel protegido puede renovar o ajustar un ciclo.
- Renovar crea una nueva fila/ciclo y cierra el anterior; no edita en silencio
  el historial.
- Ajustar una fecha requiere motivo, usuario autenticado y auditoría.
- Un reinicio, una nueva versión del shell, una falla de red o una consulta
  repetida nunca renuevan ni acortan un ciclo.
- Los reintentos del panel usan idempotencia para no crear dos renovaciones.

### Avisos calculados en servidor

En cada `state` el Worker compara `server_now` con el ciclo activo:

- Más de 14 días antes: no devuelve aviso de mantenimiento.
- Desde 14 días antes hasta 8 días antes: devuelve un aviso único de etapa
  `final_14_days`.
- En los 7 días previos al vencimiento: devuelve como máximo un aviso por día
  UTC, etapa `final_7_days`.
- Desde `due_at` inclusive: devuelve un aviso `expired` en cada apertura, con
  `requires_consent: true`, `closable: false` y una cuenta regresiva de 5 s.

El shell no conoce esas fronteras. Solo recibe `frequency` y el texto ya
decidido.

La lógica se expresa como una función pura equivalente a
`evaluate(server_now, cycle, eventos_de_hoy) -> Notice`. Los handlers solo
cargan D1, inyectan el reloj del Worker y persisten el evento necesario. Las
pruebas de tabla cubren exactamente las fronteras de 14, 8, 7 y 0 días, además
de aperturas repetidas en el mismo día.

### Reloj y caché

- `server_time` es el único reloj de negocio.
- La firma impide que un usuario cambie el texto, la severidad, el equipo o la
  fecha en la caché sin ser detectado.
- Una respuesta online válida reemplaza la caché anterior.
- En modo offline el shell puede mostrar la última respuesta firmada, marcada
  internamente como caché, pero no inventa avisos nuevos. Si la respuesta está
  vieja o no existe, lanza SIDC igualmente y registra el motivo.
- El estado firmado no es una defensa contra rollback total de la máquina: una
  persona con privilegios de administrador podría restaurar un archivo viejo.
  Por eso la expiración, el `server_time`, la revocación y el cálculo real viven
  en el Worker cuando vuelve la conectividad.

## 6. Diseño de avisos, ventana de contacto, ticket y panel

### Avisos

Cada aviso firmado contiene `id`, `severity`, `frequency`, `title`, `message`,
`closable`, `requires_consent`, `countdown_seconds` y el contacto común.
Severidades propuestas:

| Severidad | Uso | Presentación |
| --- | --- | --- |
| `info` | Aviso previo o informativo. | Color neutro; cierre inmediato. |
| `warning` | Ventana final de 14 días o aviso diario. | Color de advertencia; cierre disponible. |
| `critical` | Ciclo vencido y puerta de consentimiento. | Color destacado; bloquea el arranque hasta consentimiento explícito. |

Cerrar un aviso previo solo afecta la ventana actual. No marca “cumplido”, no
renueva, no oculta el siguiente aviso y no escribe una decisión local. El aviso
`expired` no se puede cerrar: solo termina con aceptación o abandono, y cada
apertura vuelve a solicitar la decisión.

### Registro de consentimiento

La puerta registra, asociada a `open_id` y al ciclo, los eventos
`required`, `checked`, `countdown_completed`, `accepted` o `declined`, además de
la fecha/hora del Worker. El registro no guarda pulsaciones, coordenadas,
capturas ni texto libre: solo el estado de la decisión. Una aceptación no
renueva el ciclo ni modifica la fecha de vencimiento; prueba únicamente que la
persona aceptó continuar en ese arranque.

### Texto breve de recolección para acordar con la organización

> Este acceso directo registra únicamente lo necesario para operar y dar soporte
> al sistema: equipo, usuario de Windows, fecha/hora recibida por el servidor,
> versión del shell, versión declarada de SIDC y si SIDC abrió correctamente.
> Cuando el mantenimiento está vencido, también registra si se mostró la puerta,
> si se completó la cuenta regresiva, si se aceptó el consentimiento y si SIDC
> llegó a abrir.
> No registra teclas, pantallas, documentos ni contenido de SIDC. La información
> se usa para mantenimiento y atención de tickets, se conserva por el período
> aprobado por la organización y queda accesible solo al personal autorizado.
> Si no hay conexión, SIDC se abre de todas maneras salvo que exista una última
> respuesta firmada que ya indique mantenimiento vencido; en ese caso se aplica
> la puerta de consentimiento aprobada.

Este texto debe pasar por la aprobación institucional antes de liberar el shell.

### Formulario público de tickets

- Campos: nombre, equipo y descripción; todos obligatorios, con límites de
  longitud y escape HTML al mostrar.
- Añadir una validación Turnstile en servidor, límites de cuerpo y descripción y
  rate limit de plataforma para la ruta pública, si el binding está habilitado
  en la cuenta Free. No se crea una tabla de rate limit en D1.
- El formulario no pide correo si no es necesario. El Worker envía el aviso al
  único destino administrativo verificado mediante el binding `send_email`, no a
  una dirección proporcionada por el visitante.
- Persistir primero. Si el binding falla, el ticket queda abierto con
  `notified: false` y aparece en el panel para reintento o gestión manual.
- No insertar la descripción directamente en HTML del correo sin escape. El
  correo debe incluir folio, nombre, equipo, descripción y enlace al panel, sin
  incluir tokens ni cabeceras de autenticación.

### Correo con Cloudflare Email Service

El Worker usará el binding `send_email` de Cloudflare. El remitente pertenece a
un dominio incorporado a Cloudflare Email Service y el binding se restringe a
una sola dirección de destino verificada. No hay API key de proveedor ni secreto
de correo en el repositorio, el shell o D1. La configuración requiere validar el
dominio en Cloudflare DNS y confirmar que el destino verificado satisface el
flujo de soporte.

El envío puede ser síncrono después de la persistencia o ejecutarse con
`ctx.waitUntil`; en ambos casos el resultado solo actualiza `notified`. Un error
de correo nunca borra el ticket ni bloquea SIDC. El panel permite localizar
tickets no notificados.

### Panel

El panel mínimo tiene cuatro vistas:

1. **Equipos:** `install_id` legible, estado, última apertura, versión del shell,
   versión de SIDC, ciclo activo, ruta configurada y revocación.
2. **Eventos:** filtros por fechas, equipo, usuario de Windows, versiones y
   resultado, estado de consentimiento y aperturas sin consentimiento;
   exportación limitada al personal autorizado.
3. **Ciclos:** renovación, ajuste con motivo, historial y confirmación clara de
   que el cambio no borra la auditoría.
4. **Tickets:** lista, detalle, estado (`open`, `in_progress`, `resolved`,
   `spam`), notas internas y estado de notificación.

El panel se sirve desde el propio Worker. Su HTML se renderiza con Hono JSX,
htmx resuelve las interacciones pequeñas y el CSS/TypeScript se inyecta desde
`src/panel/`; no se crea una aplicación SPA, un build frontend separado ni se
depende de Supabase. Access protege la superficie administrativa y D1 guarda su
estado.

Se recomienda Cloudflare Access sobre un Worker protegido directamente. El
Worker debe validar el JWT de Access y limitar el panel a la identidad o grupo
administrativo. Una contraseña propia con hash y sesiones sería una alternativa
de último recurso, pero añade recuperación, rotación, cookies, CSRF, bloqueo y
auditoría que Access ya resuelve.

## 7. Seguridad

### Secretos

Solo viven como secretos del Worker o en el proveedor seguro de CI:

- clave privada Ed25519 de firma;
- secreto de servidor de Turnstile;
- configuración del binding `send_email`, configuración de Access y cualquier
  secreto de despliegue. El destinatario del correo queda restringido en el
  binding, no se acepta desde el formulario.

El shell solo contiene claves públicas. El token de instalación se trata como
credencial revocable: se almacena con ACL local, se hash-ea en D1 y no se
imprime. No se usarán claves reales en tests, fixtures, ejemplos, commits ni
logs; se emplean valores claramente ficticios o secretos inyectados por el
arnés.

### Autenticación y autorización

- Cloudflare Access autentica y autoriza el panel y los endpoints administrativos.
- El panel genera un código de enrolamiento corto y de un solo uso. D1 guarda su
  hash y vencimiento; nunca se guarda una contraseña propia del shell.
- El shell usa un token opaco por instalación solo contra sus endpoints. El
  token se almacena con ACL local, se hash-ea en D1 y no se imprime.
- En operación normal el shell autentica con token por instalación, no con la
  identidad del usuario de Windows.
- Cada instalación tiene `install_id` y token distintos.
- Un token revocado recibe `401/403`; el shell no muestra el error y abre SIDC.
- El panel usa Access, JWT validado y autorización por rol. No se permite que un
  usuario autenticado cualquiera renueve ciclos. Esta capa sigue siendo
  Cloudflare Access; no es Supabase.
- El formulario público nunca comparte credenciales con el shell.

### Revocación

El panel revoca el token, registra motivo y marca la instalación. La revocación
se hace efectiva en la próxima solicitud online; un equipo completamente offline
no puede recibir la noticia, por diseño de fail-open. No se usará la revocación
como mecanismo para impedir que SIDC arranque. La puerta de consentimiento solo
se activa por el estado `expired` firmado y recibido/cached; nunca por una
revocación local inventada.

### Rate limit y anti-spam sin salir del free tier

- Turnstile obligatorio en producción, validado en servidor; el token es de un
  solo uso y tiene una ventana corta.
- Límite de cuerpo y descripción, normalización, escape, respuesta uniforme e
  idempotencia del ticket.
- Usar el binding de Rate Limiting de Workers para la ruta pública si está
  disponible en la cuenta, sin duplicar un contador en D1. Se limita por ruta y
  combinación de señales de abuso; no se toma una IP como identidad permanente.
- No se implementan honeypot, cooldown en D1 ni cola propia en esta versión.
  Persistir primero permite gestionar manualmente cualquier fallo de correo.

### Integridad de respuestas

- JWT compacto con `alg=EdDSA`, `kid`, `iss`, `aud`, `sub`, `iat`, `nbf`, `exp`,
  `protocol_version` y el estado operativo.
- Rotación con dos claves públicas embebidas durante una transición; retiro de
  la anterior en una versión posterior.
- La clave privada solo se importa desde el secreto de despliegue y nunca se
  devuelve al panel.
- El shell rechaza respuestas con equipo distinto, claims inválidos, firma
  inválida, `kid` desconocido o cuerpo truncado; en todos esos casos aplica
  `Resolve(ctx) State` y abre SIDC salvo que exista una caché firmada que exija
  consentimiento.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación de diseño |
| --- | --- |
| Antivirus o SmartScreen marca el shell por ser un exe nuevo con red | Firma Authenticode, instalador firmado, dominio estable, releases reproducibles, hashes publicados, sin ofuscación, sin inyección de procesos y con una política de privacidad visible. |
| Certificado de firma comprometido o reputación inicial baja | Certificado protegido en CI, timestamping, rotación documentada, canal de actualización único y prueba en varias versiones de Windows antes del despliegue. |
| UAC interrumpe cada apertura | El shell no pide UAC ni toca registro, servicios o SysWOW64. Solo el instalador independiente de AegisDesk instala/actualiza con elevación. |
| Acceso directo sigue apuntando a SIDC | AegisDesk debe crear/verificar el target del shell, el working directory y el icono; la prueba integrada inspecciona `.lnk` de Menú Inicio y Escritorio. |
| Rutas con espacios, acentos o cambios de carpeta | Guardar ruta absoluta aprobada, usar APIs de proceso sin concatenar comandos, no depender del directorio actual y validar que el destino está dentro de la raíz esperada. |
| Usuario local altera caché o configuración | Firma de la respuesta, ACL para configuración/token, verificación de ruta y no confiar en la caché para decisiones de negocio. Un administrador local siempre puede alterar el equipo; se documenta como límite. |
| La puerta de vencimiento se percibe como coercitiva o afecta la operación | Texto aprobado por la organización, consentimiento explícito, registro de `accepted/declined`, sin ocultar el motivo y revisión legal/operativa antes de activarla. La regla de no abrir tras rechazo debe aprobarse expresamente. |
| Código de enrolamiento filtrado o reutilizado | Código corto, hash en D1, vencimiento, un solo uso, Access para generarlo y transacción que lo marca como usado antes de crear la instalación. |
| Soporte olvida ejecutar AegisDesk después de AegisSetup | Runbook de soporte y smoke test de primera configuración: generar código, enrolar, seleccionar SIDC, crear el acceso directo, abrir y registrar el evento. |
| Worker o D1 llega al límite gratuito | Una llamada de estado y una telemetría por apertura, índices, paginación, no hacer polling, retención, alertas de consumo y pruebas de volumen. Workers Free son 100.000 requests/día; D1 tiene límites diarios de lecturas/escrituras. |
| Muchos panelistas superan el límite de Access Free | Mantener el panel para pocos administradores; si crece el grupo, revisar plan antes de abrirlo a soporte general. |
| D1 es single-threaded por base y una escritura se atasca | Transacciones pequeñas, índices, idempotencia, paginación, no guardar payloads grandes y monitorizar errores de sobrecarga. |
| Turnstile o Email Service no responde | Persistir ticket antes del correo, `notified: false`, reintento administrativo, timeout y no bloquear SIDC. |
| Spam consume la ruta de tickets | Turnstile, rate limit de plataforma si está disponible, límites de campos, idempotencia y gestión manual; no se guarda un contador de IP en D1. |
| Token de instalación filtrado | Token aleatorio por PC, hash en D1, revocación, límites por instalación, ninguna capacidad administrativa y renovación del token desde un flujo controlado. |
| Respuesta firmada antigua se reproduce offline | TTL firmado, `server_time`, caché de última respuesta, no generar avisos locales, refresco obligatorio cuando vuelva la red y aceptación explícita de que fail-open impide revocación instantánea offline. |
| El shell se actualiza y rompe el contrato | `protocol_version`, fixtures de contrato, compatibilidad hacia atrás, actualización gradual y rollback a un binario firmado anterior. |
| Datos personales se usan fuera de propósito | Aviso aprobado, minimización, retención, acceso por rol, exportación/borrado según política institucional y no guardar datos de SIDC. |

## 9. Decisiones abiertas para el dueño

Son ocho como máximo; cada una trae recomendación para poder avanzar sin otro
intercambio antes de aprobar la Fase 2.

1. **Nombre definitivo.** Queda adoptado provisionalmente `AegisDesk`; solo falta
   confirmar la marca final antes del primer release público.
2. **Nombre y datos de contacto visibles.** Recomiendo definir un nombre
   institucional o de soporte, una URL HTTPS estable del formulario y una única
   dirección administrativa verificada para el binding `send_email` antes del
   primer enrolamiento.
3. **Destino exacto de SIDC.** Recomiendo que AegisSetup configure como destino
   el ejecutable operativo generado `*_AegisSetup.exe`, nunca `*_ORIGINAL.exe`,
   y que el shell no busque ejecutables alternativos.
4. **Identidad del panel.** Recomiendo Cloudflare Access con una política de
   grupo/correo administrativo y validación de JWT. El shell solo usa códigos de
   enrolamiento de un solo uso; no se usará login propio ni Supabase.
5. **Retención de datos.** Recomiendo 12 meses para telemetría, 24 meses para
   tickets y auditoría, sujetos a la política de la organización.
6. **Renovación manual.** Recomiendo que solo el panel renueve o ajuste ciclos,
   siempre con motivo y auditoría; el shell nunca debe poder forzar una
   renovación.
7. **Actualización del shell.** Recomiendo distribución por release firmado y
   actualización mediante el instalador independiente de AegisDesk, con canal
   estable y rollback; no un auto-updater que se ejecute con privilegios desde
   el shell.
8. **Usuario de Windows en eventos.** Recomiendo enviar el nombre local sin
   dominio, mostrarlo solo en el panel, conservarlo por el período acordado y
   excluir cualquier nombre de usuario que aparezca dentro de logs de error.

## 10. Plan de implementación por hitos

Todos los hitos tienen tests integrados asociados. No se considera terminado un
hito si solo pasan unit tests.

Resumen de fases: **H0** valida reutilización y dependencias; **H1** entrega el
Worker, D1, panel, ciclos, JWT, tickets y pruebas Vitest; **H2** entrega el shell,
primera configuración, caché fail-open, UI, acceso directo, lanzamiento e
instalador con pruebas Go; **H3** ejecuta smoke integrado, preview, despliegue y
rollback. El orden evita construir el shell contra un contrato del Worker que
todavía pueda cambiar.

### Preparación transversal

0. Congelar el contrato `v1`, los campos de telemetría aprobados, el texto de
   recolección, el nombre/contacto y la ruta objetivo de SIDC.
1. Crear fixtures sin secretos reales: respuestas firmadas, tokens ficticios,
   ciclos deterministas y tickets sintéticos.
2. Definir CI para ambos hermanos: formato/lint, tests unitarios, tests de
   integración, tests de contrato, build Windows del shell, build/deploy de
   preview del Worker y análisis de secretos.

### Shell

**S1 — Contrato y criptografía.**

- Cliente HTTP versionado, timeout de 2–3 s, JSON y verificación JWT EdDSA.
- Tests de claims válidos, firma inválida, `kid` desconocido, equipo incorrecto,
  expiración, audiencia/emisor incorrectos, versión futura y cuerpo truncado.
- Test de contrato contra fixtures generados por el Worker de prueba.

**S2 — Caché y fail-open.**

- Lectura/escritura de última respuesta firmada con ACL y límite de tamaño.
- Tests con red caída, timeout, DNS fallido, cache ausente, cache alterada y
  respuesta vencida.
- Verificar que una caché normal abre SIDC y que una caché `expired` activa la
  puerta de consentimiento en cada apertura.
- Verificar que una caché ausente o una respuesta no firmada no inventa un
  bloqueo y conserva la política de operación normal.

**S3 — Ventana de contacto y apertura.**

- Ventana no modal, autocierre, botón de navegador y temporizador.
- Puerta vencida, cuenta regresiva `5..1`, acciones Acepto/Cancelar y rechazo
  por cierre; comprobar que no se puede saltar con `Esc` ni con la X.
- Lanzamiento con ruta absoluta, working directory estable y resultado de proceso.
- Tests Windows con un ejecutable SIDC simulado, ruta con espacios/acentos y
  destino inexistente; el último caso debe producir log y telemetría de fallo,
  nunca un bloqueo indefinido.

**S4 — Telemetría mínima.**

- Capturar solo equipo, usuario local, servidor/fecha, versiones y resultado.
- Test que inspecciona el payload y falla si aparecen teclas, pantallas, MAC,
  contenido o rutas internas.
- Test de idempotencia de `open_id` y de abandono sin red.

**S5 — Empaquetado independiente y primera configuración.**

- Seguir convenciones de Go 1.27, `cmd/`, `internal/`, `build.ps1`, versión por
  `-ldflags` y workflow por tag `v*`.
- El instalador de AegisDesk se ejecuta después de AegisSetup. El asistente pide
  código de enrolamiento, ruta de SIDC, enrola la instalación, guarda
  token/configuración con ACL y crea el acceso directo visible `SIDC`.
- Tests integrados que inspeccionen los accesos directos de Escritorio y Menú
  Inicio, verifiquen target, working directory, icono y parámetros.

**S6 — Prueba de aceptación del shell.**

- Windows limpio con red disponible, red bloqueada, Worker caído, caché vacía,
  SIDC exitoso y SIDC fallido.
- Verificar que no modifica registro, servicios, impresoras, DSN, reportes ni
  ejecutable original.
- Verificar firma Authenticode, hash publicado y actualización/rollback por el
  instalador independiente de AegisDesk; AegisSetup no se modifica.

### Worker y panel

**W1 — Base del Worker y D1.**

- Wrangler, configuración de preview/prod, migraciones y tablas mínimas.
- Tests de migración limpia, índices, paginación y límites de longitud.
- Integración local con D1 de prueba; ningún test usa la base de producción.

**W2 — Enrolamiento y autenticación de administración.**

- Access para rutas administrativas, código de enrolamiento de un solo uso, hash
  de token permanente, revocación y autorización de rutas de shell.
- Tests de expiración, replay, doble enrolamiento, token revocado, código usado,
  actor de Access y aislamiento entre instalaciones.
- Contrato integrado shell ↔ Worker para alta y primer estado firmado.

**W3 — Ciclos, reloj y avisos.**

- Reloj inyectable en tests y reloj real del Worker en producción.
- Generador CSPRNG 2–6 meses, rechazo de sesgo, persistencia transaccional,
  renovación idempotente y auditoría.
- Tests en bordes: 15 días, 14 días, 8 días, 7 días, víspera, vencimiento y
  aperturas repetidas después del vencimiento.

**W4 — Estado JWT y eventos.**

- JWT EdDSA con `jose`, claims de tiempo, audiencia, emisor, `kid`, rotación y
  respuesta compatible con el shell.
- Tests cruzados: el shell verifica una respuesta producida por el Worker de
  prueba y rechaza modificaciones de cualquier campo firmado.
- Guardas de privacidad y esquema de telemetría.
- Eventos integrados de `required`, `checked`, `countdown_completed`, `accepted`
  y `declined`, correlacionados con la apertura y el ciclo vencido.

**W5 — Tickets, Turnstile y Email Service.**

- Formulario público, validación de servidor, anti-spam, persistencia previa y
  estado de notificación.
- Mock de Siteverify y fake del binding `send_email` en tests; jamás usar correo
  real en CI.
- Test de fallo de correo, `notified: false`, retry administrativo, escape HTML,
  descripción grande y abuso de frecuencia.

**W6 — Panel con Access.**

- HTML, CSS y TypeScript inyectado/servido directamente por el Worker, JWT de
  Access validado, rol administrativo, vistas de equipos, telemetría, ciclos y
  tickets.
- Tests con JWT firmado de prueba: válido, expirado, audiencia incorrecta,
  usuario sin rol y mutación sin motivo.
- Smoke integrado de rutas, HTML renderizado y mutaciones contra preview con
  identidad de prueba. No se agrega una suite Playwright ni un frontend SPA.

**W7 — Límites, observabilidad y despliegue.**

- Contadores de requests, filas D1, errores de correo, respuestas `429` y
  revocaciones visibles para el administrador.
- Prueba de volumen compatible con free tier, paginación y depuración conforme
  a retención.
- Preview → producción con migración revisada, secretos cargados fuera del repo,
  validación de firmas, smoke test de enrolamiento/estado/ticket y plan de
  rollback.

### Gate de integración final

Antes de pedir aprobación de producción se debe ejecutar una prueba completa:

`AegisSetup instala y configura SIDC → soporte abre AegisDesk → introduce código
de enrolamiento y selecciona ruta → creación del acceso directo → shell pide
JWT de estado → Worker persiste apertura → shell muestra aviso → shell abre un
SIDC de prueba → Worker recibe eventos → formulario crea ticket → D1 lo conserva
→ Email Service intenta el aviso → panel Access muestra y gestiona todo.`

La misma secuencia se repite con Worker inaccesible y red desconectada. Si la
última respuesta firmada no indica vencimiento, el resultado esperado es que SIDC
abra; si sí indica `expired`, debe aparecer la puerta de consentimiento y la
decisión debe quedar registrada cuando haya conectividad. La diferencia es la
disponibilidad del estado fresco y de la telemetría.

## Fuentes de límites y capacidades consultadas

- [Cloudflare Workers — Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare D1 — Limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Cloudflare D1 — Pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare Access — Applications](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/)
- [Cloudflare Zero Trust — Pricing](https://www.cloudflare.com/plans/zero-trust-services/)
- [Cloudflare Turnstile — Plans](https://developers.cloudflare.com/turnstile/plans/)
- [Cloudflare Turnstile — Server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Cloudflare Workers — Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Cloudflare Workers — Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- [Cloudflare Email Service — Send bindings](https://developers.cloudflare.com/email-service/configuration/send-bindings/)
- [Cloudflare Email Service — Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)
- [Cloudflare Email Routing — Verified destinations](https://developers.cloudflare.com/email-routing/setup/email-routing-addresses/)
- [Hono — JSX](https://hono.dev/docs/guides/jsx)
- [Hono — htmx example](https://hono.dev/examples/htmx)
- [Drizzle — Cloudflare D1](https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1)
- [Screenata/open-attest](https://github.com/Screenata/open-attest)
- [ncruces/zenity](https://github.com/ncruces/zenity)
- [panva/jose](https://github.com/panva/jose)
- [golang-jwt/jwt](https://github.com/golang-jwt/jwt)

