# Aviso de privacidad de AegisDesk

Versión: `0.1.0`.

Aviso aprobado por el proveedor de AegisDesk para su publicación.

## 1. Proveedor, roles de tratamiento y alcance

El desarrollador y proveedor independiente de AegisDesk es **Antony Monge López**, cédula **604700548**, con domicilio informado en **El Cruce, La Alegría, Costa Rica**. El contacto general para privacidad es **antonyml2016@gmail.com**; soporte: **soporte@tonyml.com** y **+506 85456150**. Quién actúa como responsable o encargado de cada tratamiento debe determinarse por finalidad, control efectivo y relación con la Organización cliente, y formalizarse antes de producción. Este aviso cubre AegisDesk, su enrolamiento, sincronización de estado, telemetría operativa, soporte y el formulario de tickets. No se publican aquí alias de otros proyectos.

## 2. Datos tratados según el código actual

El enrolamiento recibe versión del protocolo, versión del shell, versión de SIDC, nombre del equipo, ruta del ejecutable SIDC y un código de un solo uso. El Worker crea el identificador de instalación, almacena el hash del token de instalación y guarda estado, fechas, versiones, organización/grupo/usuario asignados y ciclo.

Cada apertura envía identificador de instalación, identificador de apertura, versión del shell y versión de SIDC. El Worker agrega la fecha y hora de recepción, registra la apertura y puede emitir avisos de ciclo.

La aceptación de términos registra identificador de instalación, versión de términos, SHA-256 del documento, fecha y hora UTC declaradas por el cliente, método (`installer`, `first-run` o `reacceptance`) y versión del shell. El Worker agrega `received_at`. La tabla de aceptaciones no tiene actualmente purga automática.

Los eventos admitidos son apertura, resultado de lanzamiento, consentimiento requerido, cuenta regresiva completada, aceptación y rechazo. Incluyen ID técnico de instalación/apertura, nombre del equipo, versiones, estado y resultado del lanzamiento. La versión actual del shell ya no envía `windows_user`; el Worker ignora ese campo heredado de shells anteriores. Registros históricos que ya lo contengan permanecen sujetos a la purga de telemetría de 365 días.

El shell recibe y muestra estado de instalación, fecha de ciclo, nombre de equipo, última apertura, organización, grupo, nombre visible de usuario asignado por administración, contactos, horarios, mensajes y enlaces configurados por soporte.

El formulario de tickets solicita nombre, equipo o área, una categoría y un problema elegidos de listas predefinidas, token de Turnstile e identificador de idempotencia. No tiene campo de descripción libre. El Worker genera un resumen legible usando únicamente las opciones permitidas y persiste nombre, equipo, resumen generado, fecha de creación, estado del ticket y estado de notificación. Resend recibe el identificador, nombre, equipo, ese resumen y un enlace al panel. Cloudflare Turnstile recibe el token de verificación y, cuando está disponible, la IP usada para validar el desafío. El código del Worker no persiste la IP en la tabla de tickets.

El panel administrativo usa Cloudflare Access para autenticar a las personas administradoras. Sus datos de identidad y los datos mostrados en el panel dependen de la configuración de Access y de la Organización cliente.

## 3. Datos que no se buscan

Los datos de AegisDesk (ID técnico, versiones, estado, ruta configurada del ejecutable y eventos operativos) son distintos del contenido de SIDC. El shell no contiene código para capturar teclado, pantalla, cámara, audio, portapapeles, documentos, contenido de bases de datos ni sesiones de SIDC, ni navegación general. AegisDesk no debe extraer ni almacenar contenido de SIDC salvo que una función concreta lo requiera y exista autorización expresa, finalidad documentada y aviso actualizado. El formulario de tickets no admite narrativas libres; los campos de nombre y equipo solo deben identificar a quien reporta y su equipo.

## 4. Finalidades y bases por definir

Las finalidades son: enrolar el equipo; autenticar la instalación; entregar configuración y estados firmados; mostrar soporte; gestionar ciclos de mantenimiento; impedir un lanzamiento desautorizado según el estado remoto; registrar aperturas y resultados; atender incidentes y tickets; prevenir abuso con Turnstile y límites; generar notificaciones; administrar organizaciones, equipos, usuarios y ciclos; y mantener seguridad y auditoría.

La base jurídica no debe declararse de forma genérica. El abogado y cada Organización deben determinar para cada finalidad quién decide el tratamiento y si corresponde consentimiento informado u otra excepción o habilitación prevista en la Ley 8968 y su Reglamento. Este documento no asume que la relación contractual ni un interés legítimo sean, por sí solos, base suficiente bajo el marco costarricense. La aceptación de términos del shell no se debe usar como sustituto automático de la base de tratamiento.

## 5. Destinatarios y encargados

Los proveedores identificados en el repositorio son Cloudflare (Workers, D1, Access y Turnstile), Resend para correo de tickets y GitHub Actions para automatización de compilación y publicación. La lista de funciones, datos, región y verificación contractual está en [subprocessors.md](subprocessors.md). Deben verificarse los contratos, DPA, transferencias internacionales, subencargados ulteriores y configuración real antes de producción.

## 6. Conservación

El Worker ejecuta una tarea de limpieza programada con valores operativos provisionales: telemetría a 365 días, auditoría a 730 días, códigos de enrolamiento siete días después de vencer, tickets resueltos a 365 días, límites de tasa después de un día y anonimización de ciertos campos de instalaciones revocadas a 365 días. Estos valores están definidos como constantes de código, no como configuración de producción administrable por el titular. Las aceptaciones de términos se conservan y actualmente no hay una purga automática; los cinco años figuran como propuesta provisional, no como retención implementada. El shell conserva localmente configuración, caché, aceptación, metadatos de seguridad y logs hasta la desinstalación o limpieza implementada. El detalle consta en [retention-policy.md](retention-policy.md); son valores técnicos observados, no plazos legales.

## 7. Derechos y solicitudes

La persona titular puede solicitar, según corresponda, información sobre el tratamiento, acceso, actualización, rectificación, inclusión, exclusión o eliminación, oposición y las demás acciones reconocidas por la Ley 8968 y su Reglamento. Las solicitudes deben enviarse a **antonyml2016@gmail.com** y, cuando los datos provengan de una Organización, también al canal de privacidad de esa Organización. El correo informado es el contacto general vigente; un alias específico de privacidad de AegisDesk queda pendiente de habilitar. Debe definirse un procedimiento de verificación de identidad, atención, excepciones de conservación y registro de la solicitud.

## 8. Seguridad

El shell verifica respuestas JWT Ed25519 con emisor, audiencia, sujeto, `kid`, algoritmo y tiempos; guarda el token de instalación protegido por DPAPI cuando está disponible, aplica ACL local, usa escritura atómica y limita la información en logs. El Worker conserva hash del token, protege el panel con Cloudflare Access, valida entradas y usa Turnstile en el formulario. Ningún control elimina el riesgo de un administrador local, una cuenta comprometida o un proveedor externo.

## 9. Incidentes y cambios

Los incidentes se gestionan con el plan de [incident-response.md](incident-response.md). Los cambios materiales al tratamiento deben reflejarse en una versión nueva del aviso, comunicarse por el canal disponible y, cuando corresponda, requerir reaceptación de los términos.

## Referencias normativas para revisión

- [Ley 8968 — Ley de Protección de la Persona frente al Tratamiento de sus Datos Personales](https://www.pgrweb.go.cr/DOCS/NORMAS/1/VIGENTE/L/2010-2019/2010-2014/2011/1153F/DCEF7.HTML).
- [Decreto Ejecutivo 37554-JP — Reglamento a la Ley 8968](https://www.pgrweb.go.cr/DOCS/NORMAS/1/VIGENTE/D/2010-2019/2010-2014/2012/12270/ECA5D.HTML).
- [Ley 7472 — Promoción de la Competencia y Defensa Efectiva del Consumidor](https://pgrweb.go.cr/scij/Busqueda/Normativa/Normas/nrm_texto_completo.aspx?nValor1=1&nValor2=26481&nValor3=133737&param1=NRTC&strTipM=TC).

## PLACEHOLDERS PENDIENTES

- Identidad jurídica de cada Organización cliente y rol responsable/encargado.
- Base jurídica por finalidad y procedimiento para titulares.
- Alias dedicado de privacidad de AegisDesk, si se habilita.
- Domicilio de bases, transferencias internacionales, DPA y subencargados.
- Confirmación contractual de los plazos de tickets, instalaciones, ciclos, auditoría, logs y copias.
- Confirmar la disposición y acceso a registros históricos que aún contengan `windows_user`.
