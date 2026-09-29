# AegisDesk

> Cascarón de intermediación operativa, verificación criptográfica y soporte asistido para aplicaciones de escritorio empresariales.

[![Go](https://img.shields.io/badge/Go-1.27+-00ADD8?style=flat-square&logo=go)](https://golang.org)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers_%2B_D1-F38020?style=flat-square&logo=cloudflare)](https://workers.cloudflare.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Security](https://img.shields.io/badge/Signing-Ed25519_(EdDSA)-brightgreen?style=flat-square)](https://jwt.io)
[![Tests](https://img.shields.io/badge/Tests-Passing_(48)-success?style=flat-square)]()
[![Status](https://img.shields.io/badge/Estado-Fase_2_(Implementación)-informational?style=flat-square)]()

---

## 📌 Descripción general

**AegisDesk** es un intermediario de escritorio (*shell*) ligero y seguro diseñado para envolver la ejecución de aplicaciones empresariales y de escritorio heredadas. Actúa como punto de enlace entre el acceso directo del usuario y el ejecutable operativo objetivo, gestionando ventanas de soporte asistido, telemetría mínima auditable y verificación de ciclos de mantenimiento mediante un backend serverless en **Cloudflare Workers** respaldado por **Cloudflare D1**.

---

## 🛡️ Principios de diseño

* **Caché con ventana controlada:** Una caché firmada dentro de su TTL permite operar sin conexión; durante la gracia offline se muestra un aviso; fuera de la gracia, o ante una instalación ya sincronizada sin configuración válida, el shell solicita contacto. El fallback empaquetado `active` solo existe antes de la primera sincronización exitosa.
* **Integridad del ejecutable:** El binario original de la aplicación y sus recursos asociados permanecen estrictamente intactos. AegisDesk no inyecta código, no altera la memoria ni modifica el software existente.
* **Autoridad centralizada:** El Worker es la única fuente de verdad para el cálculo de fechas, vigencias, avisos y revocaciones. El *shell* local no calcula reglas de negocio; únicamente interpreta respuestas firmadas.
* **Verificación criptográfica:** La comunicación y los estados locales se validan mediante tokens JWT estándar con algoritmo **Ed25519 (EdDSA)**.
* **Privacidad:** La telemetría operativa usa identificadores técnicos, versiones, nombre del equipo y resultados de eventos. El shell ya no envía el nombre de usuario de Windows. No captura pulsaciones, pantalla, documentos ni contenido de bases de datos.
* **Protección Zero Trust:** El panel administrativo y sus endpoints están resguardados bajo **Cloudflare Access** con validación estricta de aserciones JWT (`cf-access-jwt-assertion`).

Los borradores de términos, privacidad, retención, subencargados y respuesta a incidentes están en [`docs/legal/`](docs/legal/). Requieren revisión profesional antes de producción. El instalador interactivo registra la aceptación de términos; una instalación silenciosa deja la aceptación para el primer arranque. Los avisos de dependencias están en [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) y la política de vulnerabilidades en [`SECURITY.md`](SECURITY.md).

## Independencia, propiedad y autorización de sistemas

AegisDesk es software independiente desarrollado y provisto por **Antony Monge López** como servicio tecnológico independiente. La Organización cliente actual informada por el proveedor es **FEMUCARIBE**; los términos generales se mantienen reutilizables para otras organizaciones y los permisos concretos se documentan por separado.

**SIDC no forma parte de AegisDesk.** El Proveedor no reclama derechos de propiedad, licencia, distribución ni titularidad sobre SIDC, sus bases de datos, código, documentación, infraestructura ni información. Esos derechos corresponden a FEMUCARIBE o al titular que jurídicamente corresponda. AegisDesk no concede autorización para acceder o usar SIDC; esa autorización debe provenir de FEMUCARIBE o del titular autorizado.

AegisDesk puede interactuar técnicamente con sistemas institucionales o de terceros que la Organización cliente autorice. Su licencia cubre solo el software y los componentes originales de AegisDesk que el Proveedor posea o pueda licenciar. No cubre SIDC ni dependencias de terceros; estas últimas se rigen por las licencias incluidas en [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). AegisDesk no debe extraer ni almacenar contenido de SIDC; una función que lo requiera necesitará autorización expresa, finalidad documentada, minimización y aviso actualizado.

---

## 🏗️ Arquitectura del sistema

```mermaid
flowchart LR
    A["Acceso directo del usuario"] --> B["AegisDesk Shell (Go)"]
    B -->|1. Consulta estado (2-3s)| C["Cloudflare Worker (Hono + D1)"]
    C -->|2. Estado firmado (EdDSA)| B
    B -->|3. Caché controlada / gracia offline| D["Caché local (ProgramData)"]
    B -->|4. Si mantenimiento vigente| E["Ejecutable de la aplicación"]
    B -->|5. Si mantenimiento vencido| F["Puerta de consentimiento (5s)"]
    F -->|Acepta| E
    F -->|Cancela| G["Cierre"]
    H["Administración (Zero Trust)"] -->|Cloudflare Access| C
```

---

## 📂 Estructura del repositorio

```text
AegisDesk/
├── .github/workflows/     # CI/CD automatizado (pruebas, semver y releases oficiales)
├── docs/
│   └── diseno.md          # Especificación técnica detallada de Fase 1
├── shell/                 # Binario de escritorio Windows (Go)
│   ├── cmd/aegisdesk/     # Punto de entrada de la aplicación
│   ├── internal/
│   │   ├── launch/        # Ejecución controlada de la aplicación y creación de accesos .lnk
│   │   ├── state/         # Cliente HTTP, caché controlada y verificación JWT
│   │   └── ui/            # Diálogos nativos y botón de contacto
│   ├── build.ps1          # Script de build, inyección de ldflags y empaquetado
│   └── installer.iss      # Script del instalador Inno Setup
└── worker/                # Backend serverless (TypeScript + Cloudflare Workers)
    ├── migrations/        # Esquemas SQL para Cloudflare D1
    ├── src/
    │   ├── panel/         # Panel de gestión administrativo embebido
    │   ├── cycles.ts      # Motor de cálculo y rotación de ciclos de mantenimiento
    │   ├── db.ts          # Capa de persistencia tipada sobre D1
    │   ├── index.ts       # Enrutador principal Hono, endpoints de shell y tickets
    │   ├── security.ts    # Validación de Cloudflare Access y hashing
    │   └── signing.ts     # Firma de tokens de estado con jose (EdDSA)
    └── tests/             # Suite de pruebas automatizadas con Vitest y pool de Workers
```

---

## 🔄 Flujo operativo

1. **Enrolamiento inicial:** Durante la primera puesta en marcha, soporte ingresa un código de un solo uso generado en el panel administrativo. El Worker genera un token de instalación revocable y persistido con ACL de máquina en `C:\ProgramData\AegisDesk\`.
2. **Arranque cotidiano:** El usuario ejecuta el acceso directo principal. AegisDesk consulta el estado en segundo plano (timeout de 2–3 s) mientras despliega una ventana no intrusiva de asistencia.
3. **Lanzamiento:**
   - **Estado regular / Sin red:** Transcurrido el temporizador corto, lanza el ejecutable operativo de la aplicación de forma transparente.
   - **Estado `expired`:** Se presenta una puerta de mantenimiento modal con cuenta regresiva de 5 segundos. El usuario debe aceptar explícitamente continuar bajo su responsabilidad para ejecutar la aplicación.
4. **Mesa de ayuda:** Formulario web público de tickets protegido por Cloudflare Turnstile con notificaciones por correo electrónico y gestión de estados desde el panel administrativo.

---

## 🛠️ Desarrollo y pruebas

### Worker (Cloudflare Workers + D1)

```bash
cd worker
npm install
npm test -- --run   # Ejecuta la suite de pruebas del Worker
npm run lint        # Validación con Biome
npm run typecheck   # Verificación TypeScript
node scripts/sync-legal.mjs --check  # Evita desincronizar textos y hashes legales
```

### Shell (Windows / Go)

```powershell
cd shell
go test ./...       # Pruebas unitarias de launch y state
.\build.ps1         # Compilación local con verificación de firmas
```

### Guía de configuración antes de producción

Los datos del titular y los contactos operativos ya fueron incorporados en los borradores de [`docs/legal/`](docs/legal/). Los documentos siguen marcados como borradores hasta la revisión profesional. El valor operativo inicial de retención está documentado en [`docs/legal/retention-policy.md`](docs/legal/retention-policy.md); no debe presentarse como un plazo legal sin esa revisión.

1. Para desarrollo local, copiá `worker/.dev.vars.example` como `worker/.dev.vars` y completá los valores de prueba. Ese archivo es local y no debe agregarse a Git.
2. En el entorno de producción de Cloudflare Workers, configurá los valores no secretos como variables y `STATE_PRIVATE_KEY`, `TURNSTILE_SECRET` y `RESEND_API_KEY` como secretos. Configurá también Access, `REQUIRED_TERMS_VERSION`, `TERMS_URL` y `PRIVACY_URL` para ese mismo entorno.
3. En GitHub, abrí **Settings → Secrets and variables → Actions**. En **Variables**, configurá `INNO_SETUP_SHA256` (SHA-256 verificado del instalador Inno Setup 6.4.3 fijado por el workflow), `AEGISDESK_STATE_PUBLIC_KEY_BASE64` (clave pública que corresponde a la clave privada del Worker) y `AEGISDESK_WORKER_BASE_URL`.
4. La firma Authenticode es opcional. Sin ambos secretos, se publica con una advertencia; Windows puede mostrar editor desconocido o advertencias de SmartScreen. Cuando dispongás de un certificado de firma autorizado, configurá en **Secrets** `SIGNING_CERT_PFX_BASE64` (archivo PFX convertido a Base64) y `SIGNING_CERT_PASSWORD` (su contraseña). Si configurás solo uno, o la firma no se verifica, la publicación falla. Nunca agregues el certificado al repositorio. Esto no desactiva la verificación Ed25519 de la configuración del Worker.
5. No guardés claves privadas, tokens, contraseñas ni certificados en Git, en `README.md`, en tickets ni en este chat. `GITHUB_TOKEN` lo entrega GitHub Actions al job de publicación; no lo copies manualmente.
6. Después de modificar términos o privacidad, ejecutá `node worker/scripts/sync-legal.mjs` desde la raíz y luego `node worker/scripts/sync-legal.mjs --check`. El build del shell valida los hashes de `docs/legal/LEGAL_VERSION.json`.
7. Verificá antes de producción: revisión jurídica, DPA y regiones de Cloudflare/Resend, autorización documentada de cada Organización para sus sistemas, procedimiento de derechos, retención provisional de copias y contactos de incidentes. `windows_user` ya no se envía desde el shell; las filas históricas quedan sujetas a la limpieza de telemetría. Ejecutá las pruebas de shell y Worker; no uses `npm run check` como sustituto de una autorización de despliegue.

---

## 🚀 Estado del proyecto

* [x] **Fase 1 — Diseño:** Especificación técnica, contratos de API y modelo de datos aprobados ([docs/diseno.md](docs/diseno.md)).
* [x] **Fase 2 — Base implementada:**
  - *Shell* en Go con caché controlada, gracia offline, bloqueo fuera de ventana válida, verificación EdDSA y accesos directos Windows.
  - *Worker* en TypeScript con Hono, D1, jose, Turnstile y Cloudflare Access.
  - Panel administrativo con actualización de tickets y códigos de alta.
  - Suite de pruebas del Worker y pruebas nativas en Go.
  - Pipeline de CI/CD en GitHub Actions (`release.yml`) con autoversionado semántico. Cada push a `main` calcula la versión, compila y publica el Release con su tag apuntando al commit compilado; firma con Authenticode solo cuando están configurados ambos secretos. Comienza en `0.1.0`; `feat:` aumenta minor, `BREAKING CHANGE:` o `tipo!:` aumenta major y los demás cambios aumentan patch. Un tag estable existente en ese commit se reutiliza. También admite tags `v*` y ejecución manual sobre `main`. Conserva SBOM, checksums y attestation.
* [ ] **Pendiente para puesta en producción:**
  - Despliegue de migraciones en Cloudflare D1 productivo.
  - Firma de código Authenticode para el instalador Windows.
  - Pruebas finales en máquina limpia e integración de despliegue.

---

## 📄 Referencias

Especificación técnica completa y decisiones de arquitectura documentadas en [`docs/diseno.md`](docs/diseno.md).
