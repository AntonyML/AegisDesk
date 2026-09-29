BORRADOR — REQUIERE REVISIÓN DE ABOGADO ANTES DE PRODUCCIÓN

# Plan breve de respuesta a incidentes

## Detección

Registrar la alerta, fecha UTC, sistemas afectados, instalación o proveedor involucrado, fuente de detección y persona responsable. Revisar fallos de autenticación, firmas JWT, revocaciones inesperadas, logs de Worker, D1, Access, Turnstile, Resend y GitHub Actions sin copiar tokens ni contenido innecesario.

## Contención

Preservar evidencias mínimas y aplicar controles reversibles: revocar o rotar tokens afectados, retirar claves de firma comprometidas, pausar publicación, limitar rutas, bloquear una integración o deshabilitar una instalación. No modificar el ejecutable original de SIDC. Separar producción, desarrollo y pruebas; no pegar secretos en tickets o chats.

## Análisis y erradicación

Crear una línea de tiempo, identificar alcance, instalaciones y categorías de datos, determinar la causa raíz, revisar accesos de administradores y proveedores, corregir el defecto, rotar credenciales, validar firmas y probar la recuperación con datos sintéticos. Conservar hashes, exportaciones y registros con control de integridad.

## Notificación y comunicación

El responsable de privacidad y el abogado deben decidir si existe un incidente notificable a titulares, organizaciones, proveedores o autoridades, los plazos, el contenido y el canal. No prometer que no hubo impacto antes de cerrar el análisis. Informar a la Organización cliente cuando su contrato o la ley lo exija.

## Recuperación y cierre

Restaurar desde copias verificadas, confirmar retención y permisos, observar durante una ventana definida y documentar decisiones, evidencias, impacto, medidas correctivas y lecciones aprendidas. Abrir una revisión posterior y actualizar código, avisos, contratos, pruebas y capacitación.

## Contactos iniciales

- Responsable inicial: Antony Monge López.
- Canal inicial de incidentes: **antonyml2016@gmail.com**; atención telefónica: **+506 85456150**.
- Privacidad y comunicaciones legales: **antonyml2016@gmail.com**.
- Alias dedicado de seguridad de AegisDesk pendiente de habilitar.

## PLACEHOLDERS PENDIENTES

- Responsable suplente, disponibilidad fuera de horario y contacto de cada Organización cliente.
- Canal 24/7 definitivo y contacto del abogado.
- Matriz de severidad, RTO/RPO, proveedores y plazos de notificación.
- Ubicación de evidencias, control de acceso y política de cadena de custodia.
