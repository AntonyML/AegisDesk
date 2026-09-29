# Inventario y Mapeo de Datos Personales (Data Map) — AegisDesk Worker

Este documento describe las categorías de datos personales tratados por el componente **AegisDesk Worker**, las finalidades de tratamiento, los períodos operativos de retención y los mecanismos técnicos de supresión y ejercicio de derechos. No sustituye el aviso de privacidad de [docs/legal/](../../docs/legal/) ni la revisión jurídica bajo la Ley 8968 de Costa Rica.

---

## 1. Inventario de Entidades y Campos

| Tabla D1 | Campos con Datos Personales | Categoría de Dato | Finalidad | Base Legal | Retención |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `managed_users` | `display_name`, `email` | Identificativos, Contacto | Gestión de usuarios administrados y asignación de equipos de trabajo | Ejecución de contrato / Interés legítimo | Activo mientras opere el usuario. Ante solicitud de supresión: anonimizado y deshabilitado. |
| `installations` | `equipment_name`, `sidc_target`, `assigned_user_id` | Identificativos de dispositivo y usuario asignado | Vinculación del cliente Aegis Shell con la estación de trabajo y usuario responsable | Ejecución de contrato / Seguridad | Activa mientras opere la instalación. A los 12 meses de revocación: **ANONIMIZACIÓN** (`equipment_name = '[Anonimizado]'`, ruta nulificada, usuario desvinculado; se preserva el ID opaco). **NO se borra**. |
| `cycles` | `created_by` (email admin), `reason` | Operativo / Auditoría | Control de ciclos de mantenimiento y periodicidad | Interés legítimo / Seguridad | Preservado junto con el ID opaco de instalación. |
| `tickets` | `name`, `team`, `description` | Contacto, Soporte, Reportes operativos | Gestión y resolución de incidentes técnicos y solicitudes de soporte | Base por definir según la relación de soporte | **12 meses tras la resolución** (`resolved_at`); purgado definitivo. `description` se genera a partir de opciones permitidas de área y problema; no se acepta narrativa libre. Correo con extracto de hasta 300 caracteres. |
| `terms_acceptances` | `installation_id`, `terms_version`, `terms_sha256`, `accepted_at_client`, `received_at`, `method`, `shell_version` | Registro de aceptación de términos | Evidenciar la versión aceptada y atender obligaciones o defensas que correspondan | Base por definir con abogado; no usar aceptación como comodín para tratamiento | **No se borra junto con la instalación**. La configuración provisional `1825` días no tiene purga automática implementada y requiere decisión jurídica. |
| `events` (Telemetría) | `installation_id`, `open_id`, `equipment_name`, versiones, `payload_json` | Telemetría operativa de instalación/equipo | Diagnóstico y operación del servicio | Base por definir para cada relación | Valor provisional de código: **365 días**. Purgado automático diario. El campo heredado `windows_user` no se rellena con eventos nuevos; datos históricos se purgan según esta regla. |
| `events` (Auditoría administrativa) | `actor` (email), `payload_json` (`type LIKE 'admin_%'`, `privacy_erasure_performed`, etc.) | Auditoría y gobernanza administrativa | Registro de seguridad de cambios de configuración y acceso administrativo | Interés legítimo / Seguridad (política propuesta, no obligación legal) | **730 días** (24 meses). Purgado automático diario por cron. |
| `enrollment_codes` | `created_by` (email admin) | Trazabilidad administrativa | Códigos de un solo uso para autorizar la instalación del agente | Seguridad y control de acceso | Expiración en 30 minutos; purgado automático a los **+7 días** de vencidos. |
| `admin_memberships` | `email` | Control de acceso administrativo | Asignación de roles y permisos RBAC en el panel | Seguridad / Control de acceso | Mientras la membresía permanezca activa. |
| `rate_limits` | `key` | Mitigación de abuso | Control de tasa de peticiones en endpoints públicos | Seguridad técnica | Purgado automático de registros vencidos **> 1 día**. |

---

## 2. Política de Retención y Purgado Automático (Política C6)

Los plazos son valores operativos provisionales implementados como constantes de código, no requisitos legales ni ajustes por cliente. La constante de aceptación de términos (1825 días) no se aplica: hoy no existe purga automática de esa tabla.

El servicio `CleanupService` se ejecuta diariamente a través del disparador cron `0 3 * * *` de Cloudflare Workers aplicando las siguientes reglas (`RETENTION_CONFIG`):

1. **Telemetría en `events`**:
   - Retención: **365 días**.
   - Tipos: `opening`, avisos de ciclo, resultados de lanzamiento, eventos de consentimiento, enrolamiento y heartbeat legado.
   - Purgado: `DELETE FROM events WHERE server_received_at < cutoff AND type IN (telemetry_types)`.
2. **Auditoría administrativa en `events`**:
   - Retención: **730 días**. Política propuesta para trazabilidad de gobernanza.
   - Purgado: `DELETE FROM events WHERE server_received_at < cutoff`.
3. **Códigos de enrolamiento (`enrollment_codes`)**:
   - Retención: **+7 días** tras su fecha de expiración (`expires_at < cutoff`).
   - Purgado: `DELETE FROM enrollment_codes WHERE expires_at < cutoff`.
4. **Tickets de soporte resueltos (`tickets`)**:
   - Retención: **12 meses (365 días)** tras su resolución (`resolved_at < cutoff` o `created_at < cutoff`).
   - Purgado: `DELETE FROM tickets WHERE status = 'resolved' AND ...`.
5. **Instalaciones revocadas (`installations`)**:
   - Retención: **12 meses (365 días)** tras revocación (`revoked_at < cutoff` o `updated_at < cutoff`).
   - Tratamiento: **Anonimización in situ**: `UPDATE installations SET equipment_name = '[Anonimizado]', sidc_target = '[Anonimizado]', assigned_user_id = NULL WHERE status = 'revoked' AND ...`. **NO se borran** y sus aceptaciones en `terms_acceptances` se conservan íntegras.
6. **Aceptaciones de términos (`terms_acceptances`)**:
   - Retención: `TERMS_ACCEPTANCE_RETENTION_DAYS = 1825` (provisional 5 años). *PENDIENTE: la fija un abogado según prescripción.*
   - Regla estricta: **NO se eliminan en cascada** al revocar o anonimizar una instalación.
7. **Límites de tasa (`rate_limits`)**:
   - Purgado de filas viejas con `reset_at < now - 1 día`.

---

## 3. Ejercicio de Derechos del Titular — revisión bajo Ley 8968

Los administradores con rol `platform_owner` disponen de endpoints protegidos contra CSRF y autenticados:

### A. Derecho de Acceso y Portabilidad (`POST /api/v1/admin/privacy/export`)
- **Parámetros**: `{ "email"?: string, "managed_user_id"?: string, "installation_id"?: string }`.
- **Respuesta**: Paquete consolidado en formato JSON que recopila:
  - Registro de usuario administrado (`managed_users`).
  - Instalaciones asignadas o consultadas (`installations`).
  - Aceptaciones de términos registradas (`terms_acceptances`).
  - Tickets emitidos (`tickets`).
  - Eventos de auditoría y telemetría asociados (`events`).

### B. Derecho de Supresión y Anonimización (`POST /api/v1/admin/privacy/erase`)
- **Parámetros**: `{ "email"?: string, "managed_user_id"?: string, "installation_id"?: string, "mode"?: "erase" | "delete" | "anonymize", "reason": string }`.
- **Efectos**:
  - En `managed_users`: el nombre pasa a `[Anonimizado]`, el email a `deleted-<id>@deleted.local` y el estado a `disabled`.
  - En `installations`: la instalación se **anonimiza** (`equipment_name = '[Anonimizado]'`, ruta nulificada, usuario desvinculado). **NO se elimina**.
  - En `terms_acceptances`: **NO se destruyen**, preservando la evidencia jurídica de aceptación.
  - En `tickets`: nombre y equipo pasan a `[Anonimizado]`, y la descripción se anonimiza.
  - En `events`: se genera un evento de auditoría `privacy_erasure_performed`.
  - **Medida de minimización observada**: El evento de auditoría no guarda el identificador del sujeto (ni email, ni ID de usuario, ni ID de instalación); registra el motivo, rol actuante, tipo de sujeto (`email`/`installation`/`managed_user`), modo y estadísticas de registros anonimizados. Debe verificarse esta conducta en pruebas y producción.
