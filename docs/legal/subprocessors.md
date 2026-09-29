# Proveedores y subencargados identificados

Esta lista se limita a proveedores que aparecen en el repositorio o en su pipeline. No confirma que exista un contrato, DPA, región o configuración de producción; cada dato debe verificarse antes de publicar el aviso.

| Proveedor | Uso observado | Datos potenciales | Verificar |
|---|---|---|---|
| Cloudflare Workers | Ejecuta el backend HTTP | Solicitudes de shell, configuración, eventos, tickets y datos que el Worker persiste | DPA, región/transferencias, subencargados, controles de acceso |
| Cloudflare D1 | Persistencia SQL del Worker | Instalaciones, hashes de tokens, ciclos, eventos, tickets y configuración | DPA, región, copias, retención y eliminación |
| Cloudflare Turnstile | Verificación antiabuso del formulario | Token de desafío y, si se envía, IP para la verificación | DPA, finalidad, transferencias y configuración del sitio |
| Cloudflare Access | Protección del panel administrativo | Identidad/aserción de la persona administradora y atributos configurados | DPA, grupos, retención de logs, región y permisos |
| Resend | Envío de notificaciones de tickets | Identificador, nombre, equipo, resumen generado desde opciones predefinidas y metadatos del correo | DPA, región, destinatarios, retención y subencargados |
| GitHub Actions | Automatización de build, artefactos y releases | Código, logs de build y artefactos del shell; no debería recibir datos de usuarios finales | Permisos mínimos, retención, runners, logs y secrets |

El repositorio también usa dependencias de código abierto listadas en [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). Esas bibliotecas no son subencargados por el solo hecho de distribuirse dentro del ejecutable.

## PLACEHOLDERS PENDIENTES

- Nombre jurídico y enlace vigente de cada proveedor.
- DPA, mecanismo de transferencia, región efectiva y subencargados ulteriores.
- Destinatario real de Resend y su política de retención.
- Revisión del inventario frente a la cuenta Cloudflare y configuración de producción.
