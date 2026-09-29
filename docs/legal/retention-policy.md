BORRADOR — REQUIERE REVISIÓN DE ABOGADO ANTES DE PRODUCCIÓN

# Política de retención propuesta

Esta política contiene valores operativos provisionales propuestos por el proveedor para revisión y configuración con cada Organización cliente. No son plazos legales ni valores definitivos. En el Worker los plazos implementados son constantes de código; no existe todavía una configuración por organización o panel. Deben revisarse con abogado y contrastarse con copias, servicios y producción antes de publicarse.

## Estado observado y propuesta provisional

| Categoría | Implementación observada | Propuesta provisional, sujeta a finalidad y revisión |
|---|---|---|
| Eventos de telemetría (aperturas, avisos, consentimientos y lanzamientos) | El Worker elimina tipos de telemetría anteriores a 365 días mediante tarea programada | 12 meses, salvo investigación, obligación o solicitud documentada |
| Auditoría administrativa | Constante de código de 730 días; no es configurable en producción | 24 meses, sujeto a la base jurídica documentada |
| Tickets resueltos | Constante de código de 365 días desde `resolved_at`; usa `created_at` si falta esa fecha | 12 meses después de la resolución, salvo investigación u obligación documentada |
| Instalaciones revocadas | Constante de código de 365 días; anonimiza ciertos campos, no elimina la instalación ni la aceptación | 12 meses antes de anonimizar, salvo obligación o investigación |
| Códigos de enrolamiento | Tienen vencimiento de 30 minutos y una constante de código purga filas más de 7 días después de vencer | 7 días posteriores al vencimiento, sujeto a aprobación |
| Aceptaciones de términos | No hay purga automática; la constante `1825` existe pero no la consume el proceso de limpieza | Propuesta provisional de cinco años, configurable tras definir el fundamento y con una regla de borrado efectiva antes de producción |
| Límites de tasa | Constante de código purga filas cuyo contador venció hace más de 1 día | 1 día |
| Instalaciones y ciclos | Persisten mientras existan en la base; no se observó borrado automático general de ciclos | Mientras exista la relación y luego el plazo mínimo documentado |
| Token, configuración, caché, aceptación y metadatos locales | Se limpian al desinstalar; logs y caché requieren rotación local | Token hasta desinstalación o revocación; caché según expiración/gracia; logs 90 días salvo investigación |
| Logs de CI y artefactos | GitHub Actions conserva artefactos por la configuración del workflow | Definir retención mínima, sin secretos, y revisar accesos |

## Reglas de disposición

La eliminación debe ser verificable, limitar copias de respaldo y respetar investigaciones, defensa de derechos y obligaciones de conservación. Los datos no deben conservarse “por si acaso”. Las solicitudes de eliminación se coordinan con el responsable de la base y no deben borrar una evidencia que legalmente deba preservarse sin dejar la justificación.

## PLACEHOLDERS PENDIENTES

- Validación jurídica de cada plazo y su base jurídica.
- Confirmación operativa de la tarea programada, migraciones y respaldos.
- Definir si los valores se exponen como configuración por organización y alinear la purga de aceptaciones con la decisión final.
- Inventario de copias de respaldo y regiones.
- Responsable de aprobar excepciones y registrar la eliminación.
