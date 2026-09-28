# AegisDesk

> Cascarón de intermediación operativa, verificación criptográfica y soporte asistido para terminales SIDC.

[![Go](https://img.shields.io/badge/Go-1.27+-00ADD8?style=flat-square&logo=go)](https://golang.org)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers_%2B_D1-F38020?style=flat-square&logo=cloudflare)](https://workers.cloudflare.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Security](https://img.shields.io/badge/Signing-Ed25519_(EdDSA)-brightgreen?style=flat-square)](https://jwt.io)
[![Tests](https://img.shields.io/badge/Tests-Passing_(16%2F16)-success?style=flat-square)]()
[![Status](https://img.shields.io/badge/Estado-Fase_2_(Implementación)-informational?style=flat-square)]()

---

## 📌 Descripción general

**AegisDesk** es un intermediario de escritorio (*shell*) ligero y seguro diseñado para envolver la ejecución de la aplicación heredada **SIDC** (VB6, 32-bit). Actúa como punto de enlace entre el acceso directo del usuario y el ejecutable operativo, gestionando ventanas de soporte, telemetría mínima auditable y verificación de ciclos de mantenimiento mediante un backend serverless en **Cloudflare Workers** respaldado por **Cloudflare D1**.

---

## 🛡️ Principios de diseño

* **Filosofía Fail-Open:** En operación normal, SIDC se intenta abrir siempre. La indisponibilidad de red, fallos en el Worker o ausencia de caché local nunca bloquean el inicio del sistema.
* **Integridad del ejecutable:** El binario original de SIDC (`*_ORIGINAL.exe`) y sus plantillas permanecen estrictamente intactos. AegisDesk no inyecta código ni modifica el software heredado.
* **Autoridad centralizada:** El Worker es la única fuente de verdad para el cálculo de fechas, vigencias, avisos y revocaciones. El *shell* local no calcula reglas de negocio; únicamente interpreta respuestas firmadas.
* **Verificación criptográfica:** La comunicación y los estados locales se validan mediante tokens JWT estándar con algoritmo **Ed25519 (EdDSA)**.
* **Privacidad estricta:** La telemetría es explícita y mínima (aperturas, resultado de lanzamiento, consentimientos). No se capturan pulsaciones de teclado, capturas de pantalla, documentos ni datos de base de datos.
* **Protección Zero Trust:** El panel administrativo y sus endpoints están resguardados bajo **Cloudflare Access** con validación estricta de aserciones JWT (`cf-access-jwt-assertion`).

---

## 🏗️ Arquitectura del sistema

```mermaid
flowchart LR
    A["Acceso directo SIDC"] --> B["AegisDesk Shell (Go)"]
    B -->|1. Consulta estado (2-3s)| C["Cloudflare Worker (Hono + D1)"]
    C -->|2. Estado firmado (EdDSA)| B
    B -->|3. Fallback / Fail-Open| D["Caché local (ProgramData)"]
    B -->|4. Si mantenimiento vigente| E["Ejecutable operativo SIDC"]
    B -->|5. Si mantenimiento vencido| F["Puerta de consentimiento (5s)"]
    F -->|Acepta| E
    F -->|Cancela| G["Cierre"]
    H["Administración (Zero Trust)"] -->|Cloudflare Access| C
```

---

## 📂 Estructura del repositorio

```text
AegisDesk/
├── .github/workflows/     # CI/CD automatizado (pruebas, cross-compile y releases)
├── docs/
│   └── diseno.md          # Especificación técnica detallada de Fase 1
├── shell/                 # Binario de escritorio Windows (Go)
│   ├── cmd/aegisdesk/     # Punto de entrada de la aplicación
│   ├── internal/
│   │   ├── launch/        # Ejecución del proceso SIDC y creación de accesos .lnk
│   │   ├── state/         # Cliente HTTP, resolución fail-open y verificación JWT
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
2. **Arranque cotidiano:** El usuario ejecuta el acceso directo "SIDC". AegisDesk consulta el estado en segundo plano (timeout de 2–3 s) mientras despliega una ventana no intrusiva de asistencia.
3. **Lanzamiento:**
   - **Estado regular / Sin red:** Transcurrido el temporizador corto, lanza el ejecutable operativo de SIDC de forma transparente.
   - **Estado `expired`:** Se presenta una puerta de mantenimiento modal con cuenta regresiva de 5 segundos. El usuario debe aceptar explícitamente continuar bajo su responsabilidad para ejecutar la aplicación.
4. **Mesa de ayuda:** Formulario web público de tickets protegido por Cloudflare Turnstile con notificaciones por correo electrónico y gestión de estados desde el panel administrativo.

---

## 🛠️ Desarrollo y pruebas

### Worker (Cloudflare Workers + D1)

```bash
cd worker
npm install
npm test            # Ejecuta los 16 tests de integración y ciclos
npm run lint        # Validación con Biome
```

### Shell (Windows / Go)

```powershell
cd shell
go test ./...       # Pruebas unitarias de launch y state
.\build.ps1         # Compilación local con verificación de firmas
```

---

## 🚀 Estado del proyecto

* [x] **Fase 1 — Diseño:** Especificación técnica, contratos de API y modelo de datos aprobados ([docs/diseno.md](docs/diseno.md)).
* [x] **Fase 2 — Base implementada:**
  - *Shell* en Go con resolución *fail-open*, verificación EdDSA y accesos directos Windows.
  - *Worker* en TypeScript con Hono, D1, jose, Turnstile y Cloudflare Access.
  - Panel administrativo con actualización de tickets y códigos de alta.
  - Suite de 16 pruebas integradas en Workers y pruebas nativas en Go.
  - Pipeline de CI/CD en GitHub Actions (`release.yml`).
* [ ] **Pendiente para puesta en producción:**
  - Despliegue de migraciones en Cloudflare D1 productivo.
  - Firma de código Authenticode para el instalador Windows.
  - Pruebas finales en máquina limpia junto con el instalador de AegisSetup.

---

## 📄 Referencias

Especificación técnica completa y decisiones de arquitectura documentadas en [`docs/diseno.md`](docs/diseno.md).
