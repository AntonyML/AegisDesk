# AegisDesk

> Cascarón de intermediación operativa, verificación criptográfica y soporte asistido para terminales SIDC.

[![Go](https://img.shields.io/badge/Go-1.27+-00ADD8?style=flat-square&logo=go)](https://golang.org)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers_%2B_D1-F38020?style=flat-square&logo=cloudflare)](https://workers.cloudflare.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Security](https://img.shields.io/badge/Signing-Ed25519_(EdDSA)-brightgreen?style=flat-square)](https://jwt.io)
[![Status](https://img.shields.io/badge/Estado-Fase_2_(Implementación)-informational?style=flat-square)]()

---

## 📌 Descripción general

**AegisDesk** es un intermediario de escritorio (*shell*) ligero y seguro diseñado para envolver la ejecución de la aplicación heredada **SIDC** (VB6, 32-bit). Actúa como punto de enlace entre el acceso directo del usuario y el ejecutable operativo, gestionando ventanas de soporte, telemetría mínima auditable y verificación de ciclos de mantenimiento mediante un backend descentralizado en **Cloudflare Workers**.

---

## 🛡️ Principios de diseño

* **Filosofía Fail-Open:** En operación normal, SIDC se intenta abrir siempre. La indisponibilidad de red, fallos en el Worker o ausencia de caché local nunca bloquean el inicio del sistema.
* **Integridad del ejecutable:** El binario original de SIDC (`*_ORIGINAL.exe`) y sus plantillas permanecen estrictamente intactos. AegisDesk no inyecta código ni modifica el software heredado.
* **Autoridad centralizada:** El Worker es la única fuente de verdad para el cálculo de fechas, vigencias, avisos y revocaciones. El *shell* local no calcula reglas de negocio; únicamente interpreta respuestas firmadas.
* **Verificación criptográfica:** La comunicación y los estados locales se validan mediante tokens JWT estándar con algoritmo **Ed25519 (EdDSA)**.
* **Privacidad estricta:** La telemetría es explícita y mínima (aperturas, resultado de lanzamiento, consentimientos). No se capturan pulsaciones de teclado, capturas de pantalla, documentos ni datos de base de datos.

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
```

---

## 📂 Estructura del repositorio

```text
AegisDesk/
├── shell/                 # Binario de escritorio Windows (Go)
│   ├── cmd/aegisdesk/     # Punto de entrada de la aplicación
│   ├── internal/
│   │   ├── state/         # Cliente HTTP, resolución fail-open y verificación JWT
│   │   ├── launch/        # Ejecución controlada del proceso SIDC
│   │   └── ui/            # Diálogos nativos y botón de contacto
│   └── installer.iss      # Script de empaquetado Inno Setup
├── worker/                # Backend serverless (TypeScript + Cloudflare Workers)
│   ├── src/
│   │   ├── index.ts       # Enrutamiento de la API (Hono)
│   │   ├── cycles.ts      # Motor de ciclos y plazos de mantenimiento
│   │   ├── signing.ts     # Emisión y firma de tokens EdDSA (jose)
│   │   └── panel/         # Panel de administración protegido por Cloudflare Access
│   └── migrations/        # Esquemas y migraciones de Cloudflare D1
└── docs/
    └── diseno.md          # Especificación técnica detallada de Fase 1
```

---

## 🔄 Flujo operativo

1. **Enrolamiento inicial:** Durante la primera puesta en marcha, soporte ingresa un código de un solo uso generado en el panel administrativo. El Worker crea un token de instalación único y revocable persistido con ACL de máquina en `C:\ProgramData\AegisDesk\`.
2. **Arranque cotidiano:** El usuario activa el acceso directo "SIDC". AegisDesk consulta el estado del equipo en segundo plano (timeout estricto de 2–3 segundos) mientras despliega una ventana no intrusiva de asistencia.
3. **Lanzamiento:**
   - **Estado regular / Sin red:** Transcurrido el temporizador corto, ejecuta el binario operativo de SIDC de forma transparente.
   - **Estado `expired`:** Se presenta una puerta de mantenimiento modal con cuenta regresiva visible de 5 segundos. El usuario debe aceptar explícitamente continuar bajo su responsabilidad para ejecutar la aplicación.

---

## 🚀 Estado del proyecto

* [x] **Fase 1 — Diseño:** Arquitectura, contratos de API, modelo D1 y especificación técnica aprobada ([docs/diseno.md](docs/diseno.md)).
* [x] **Fase 2 — Base implementada:** shell Go, Worker TypeScript, D1, panel, JWT EdDSA, tickets, instalador y pruebas integradas locales.
* [ ] **Pendiente para producción:** valores reales de Cloudflare, Access, Turnstile, Resend/Email Routing, firma Authenticode, smoke test en PC limpia y conexión final con el flujo operativo de AegisSetup.

---

## 📄 Referencias

Especificación completa y decisiones de arquitectura documentadas en [`docs/diseno.md`](docs/diseno.md).
