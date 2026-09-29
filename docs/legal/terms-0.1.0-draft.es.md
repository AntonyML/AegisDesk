BORRADOR — REQUIERE REVISIÓN DE ABOGADO ANTES DE PRODUCCIÓN

# Términos y Condiciones de AegisDesk

Versión del borrador: `0.1.0-draft`.

Este documento describe el uso de AegisDesk con base en el código revisado del repositorio al preparar este borrador. No constituye asesoría legal ni reemplaza la revisión del profesional responsable.

## 1. Partes y definiciones

El desarrollador y proveedor independiente de AegisDesk es **Antony Monge López**, cédula **604700548**, con domicilio informado en **El Cruce, La Alegría, Costa Rica**, correo general **antonyml2016@gmail.com** y teléfono **+506 85456150** (el “Proveedor”). La “Organización cliente” es la entidad que contrata o autoriza la instalación y administra el equipo. El “Usuario” es la persona que opera AegisDesk en un equipo autorizado.

“AegisDesk” o “Software” es el software independiente para Windows desarrollado por el Proveedor, su instalador, archivos de soporte y componentes originales de su autoría o titularidad. Puede interactuar técnicamente con aplicaciones o sistemas institucionales o de terceros cuando la Organización cliente lo autorice por separado. “SIDC” es un sistema institucional ajeno a AegisDesk. “Servicio en la nube” es el Worker y sus servicios de persistencia, administración, verificación antiabuso y notificación configurados para AegisDesk.

El Proveedor presta servicios tecnológicos de manera independiente. La relación no crea, por sí misma, vínculo laboral, societario, de agencia ni de representación entre el Proveedor y la Organización cliente.

## 2. Aceptación

La aceptación primaria se registra cuando la persona que instala selecciona expresamente la opción de aceptación en la página de licencia del instalador. Una instalación silenciosa no registra aceptación: el shell solicita una aceptación explícita en el primer arranque. El shell vuelve a solicitarla cuando la versión de términos requerida por el Servicio en la nube es posterior a la versión aceptada.

El uso continuado después de una aceptación sirve como confirmación secundaria de que la persona continúa utilizando el Software, pero no sustituye la aceptación explícita inicial o la reaceptación exigida por un cambio material. Quien no acepte debe cancelar la instalación; quien ya tenga el Software puede desinstalarlo o contactar al canal de soporte de la Organización cliente.

La aceptación se registra con versión, huella SHA-256 del texto, fecha y hora UTC del cliente, método (`installer`, `first-run` o `reacceptance`) y versión del shell. El Servicio en la nube puede registrar además la fecha y hora en que recibió el registro. Si no hay conexión, el shell conserva el registro para reintentar cuando pueda autenticarse.

## 3. Licencia de uso

El Proveedor concede una licencia limitada, no exclusiva, revocable e intransferible únicamente sobre AegisDesk y los componentes originales que le pertenecen o que está autorizado a licenciar, para instalar y usar AegisDesk en equipos autorizados. Esta licencia no concede permiso para acceder o usar SIDC.

SIDC no forma parte de AegisDesk. El Proveedor no reclama derechos de propiedad, licencia, distribución ni titularidad sobre SIDC, sus bases de datos, código, documentación, infraestructura ni información. Esos derechos corresponden a FEMUCARIBE o al titular que jurídicamente corresponda. La autorización para usar SIDC debe provenir de FEMUCARIBE o del titular con facultades para otorgarla y documentarse por separado; estos términos generales no la sustituyen.

Salvo que la ley aplicable no lo permita, no se permite: realizar ingeniería inversa, descompilar o desensamblar el Software; manipular el shell, su configuración, token o respuestas firmadas; eludir bloqueos o controles de autorización; redistribuir el instalador o el Software; ni usar credenciales de otra instalación. Esta lista no restringe derechos irrenunciables reconocidos por la ley.

## 4. Administración remota

La Organización cliente administra el equipo y determina qué sistemas autoriza para esa instalación. El Servicio en la nube puede entregar estados firmados que indiquen que una instalación está activa, deshabilitada o revocada, y avisos sobre el ciclo de mantenimiento. Con base en el estado válido recibido, AegisDesk puede mostrar soporte, bloquear el lanzamiento de la aplicación configurada cuando corresponda o solicitar una confirmación de continuidad al vencer un ciclo. Esta administración técnica no otorga al Proveedor derechos sobre el sistema institucional ni reemplaza la autorización de su titular.

El shell conserva estados deshabilitados o revocados recibidos y los aplica mientras está sin conexión. Una respuesta antigua, alterada, sin firma válida o fuera de la ventana de caché no debe convertir una instalación ya enrolada en una instalación activa. La recuperación debe gestionarse por el canal de soporte indicado; el Usuario no debe intentar eludir el control.

## 5. Datos, telemetría y finalidades

El código actual utiliza los siguientes datos:

- En el enrolamiento: código de enrolamiento de un solo uso, versión del protocolo, versión del shell, versión de SIDC, nombre del equipo y ruta configurada del ejecutable de SIDC. El Servicio genera un identificador de instalación y un token por instalación; el Worker conserva el hash del token, no el token en claro.
- En una consulta de estado: identificador de instalación, identificador de apertura, versión del shell y versión de SIDC. El Worker agrega su propia fecha y hora de recepción, consulta el ciclo activo y registra la apertura.
- En eventos: identificador de apertura, tipo de evento, nombre del equipo, versiones, estado de consentimiento y resultado del lanzamiento (`success`, `failed` o `not_attempted`). La versión actual del shell no envía el nombre de usuario de Windows.
- En una aceptación de términos: identificador de instalación, versión y SHA-256 de los términos, fecha y hora UTC declaradas por el cliente, método de aceptación y versión del shell; el Worker agrega su propia fecha y hora de recepción. El registro sirve como evidencia operativa de aceptación.
- En la configuración mostrada: estado de la instalación, ciclo de mantenimiento, datos de equipo, y cuando la administración los asigna, nombre e identificador de organización, grupo y nombre visible de usuario; también mensajes, contactos, horarios y enlaces de soporte.
- En tickets del Servicio en la nube: nombre, equipo o área, selección de categoría y problema, token de Turnstile e identificador de idempotencia. No se acepta una descripción libre: el Worker genera un resumen a partir de opciones permitidas y persiste ese resumen, nombre, equipo, fecha de creación, estado y estado de notificación. El token de Turnstile se valida contra Cloudflare y no forma parte de la tabla de tickets. El correo de notificación contiene el identificador, nombre, equipo, el resumen generado (máximo 300 caracteres) y un enlace al panel.

Las finalidades son enrolar y autenticar la instalación, entregar configuración y avisos, controlar estados administrativos y ciclos, abrir SIDC conforme a esa configuración, mantener trazabilidad operativa, atender soporte, prevenir abuso del formulario y notificar tickets.

Los datos de AegisDesk (por ejemplo, ID técnico de instalación, versiones, estado, ruta configurada del ejecutable y eventos operativos) se distinguen del contenido de SIDC. AegisDesk no debe extraer ni almacenar contenido de SIDC; una función futura que lo requiera necesitará autorización expresa, finalidad definida, minimización y actualización del aviso antes de habilitarse. El shell no captura pulsaciones, audio, cámara, pantalla, documentos, portapapeles, bases de datos ni contenido de sesiones de SIDC. No debe enviarse información clínica, contraseñas, secretos ni datos de terceros que no sean necesarios para un ticket.

La base jurídica para cada tratamiento debe identificarse antes de producción según la finalidad, quién decide los medios y fines, y la relación con cada Organización cliente. Este borrador no presume que el contrato, un interés legítimo o la aceptación de estos términos autoricen por sí solos todos los tratamientos. Deben revisarse el consentimiento informado y las excepciones o habilitaciones que realmente correspondan conforme a la Ley 8968 y su Reglamento. La Organización cliente debe definir sus instrucciones y avisos para sus Usuarios; la palabra “consentimiento” en la interfaz de mantenimiento describe la decisión operativa de continuar y no sustituye el análisis de protección de datos. La instalación o aceptación de estos términos no constituye autorización general para cualquier tratamiento o transferencia.

Los terceros y encargados identificados en el repositorio se describen en [subprocessors.md](subprocessors.md). El detalle de finalidades, derechos y retención se amplía en [privacy-notice-0.1.0-draft.es.md](privacy-notice-0.1.0-draft.es.md) y [retention-policy.md](retention-policy.md).

## 6. Tickets y contenido prohibido

El formulario de tickets solicita el nombre y equipo de quien reporta y dos opciones predefinidas para clasificar el problema; no ofrece un campo para narrativas o documentos. No deben ingresarse contraseñas, credenciales ni datos de terceros en los campos de nombre o equipo. El Servicio valida las selecciones y aplica protección antiabuso; puede responder HTTP 422 con `TOO_LONG` o `INVALID`, indicando el campo, y la interfaz muestra el motivo sin reintentar ese envío. La Organización puede clasificar un ticket como spam o resolverlo.

## 7. Mantenimiento, ciclos y avisos

El Servicio en la nube calcula los ciclos de mantenimiento y entrega fechas y avisos firmados. El shell puede mostrar un aviso en las dos semanas finales, avisos diarios en los últimos siete días y un aviso crítico después del vencimiento. El aviso crítico incluye una cuenta regresiva y una pregunta de aceptación. Si se rechaza, el shell cierra sin lanzar SIDC.

La configuración firmada tiene una ventana de uso normal, una ventana de gracia offline y una expiración total. Durante la gracia, el shell puede permitir el lanzamiento mostrando un aviso de falta de sincronización. Fuera de la gracia, solicita contacto y bloquea el lanzamiento hasta obtener una configuración válida. El equipo que permanezca completamente offline puede no recibir de inmediato un cambio remoto; esa es una limitación de cualquier control basado en conectividad.

## 8. Propiedad intelectual y terceros

AegisDesk es una herramienta independiente que puede interactuar técnicamente con sistemas ajenos dentro del alcance autorizado por cada Organización cliente. SIDC no forma parte de AegisDesk. El Proveedor no modifica ni reclama derechos de propiedad, licencia, distribución o titularidad sobre SIDC, sus bases de datos, código, documentación, infraestructura o información; tampoco concede permisos para utilizarlos. La autorización concreta para cada sistema debe provenir de la Organización cliente o de su titular autorizado y constar por separado; estos términos generales no la sustituyen. Los avisos de componentes y dependencias distribuidos se encuentran en [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). Los textos, iconos y demás activos con procedencia conocida se registran en [docs/ASSETS.md](../ASSETS.md).

## 9. Garantías y responsabilidad

El Software y el Servicio se proporcionan “tal cual”, en la medida permitida por la ley. No se excluyen el dolo, la culpa grave ni derechos irrenunciables. Cualquier tope de responsabilidad queda pendiente de definición con abogado y debe respetar los derechos irrenunciables aplicables a consumidores: **[CRITERIO A DEFINIR CON ABOGADO]**. No se prometen disponibilidad continua, prevención absoluta de fallos ni recepción instantánea de revocaciones offline.

No se establecen cláusulas de indemnidad, daños punitivos ni penalidades automáticas en este borrador. Los remedios quedan limitados a medidas cautelares y daños reales conforme a la ley civil y comercial aplicable.

## 10. Suspensión, terminación y efectos

La Organización cliente o el Proveedor pueden suspender o terminar la autorización conforme al acuerdo aplicable y al estado administrativo de la instalación. La suspensión o revocación puede impedir el lanzamiento de SIDC y mostrar los datos de contacto de soporte. La terminación de uso exige dejar de utilizar y desinstalar el Software, sin perjuicio de los registros que deban conservarse conforme a la política aplicable. La desinstalación elimina el token, configuración, caché y logs locales que el instalador pueda identificar; no elimina automáticamente los registros ya recibidos por el Worker.

## 11. Modificaciones

Los términos se versionan. Un cambio material debe informarse por el canal disponible y puede requerir reaceptación en el shell. La versión requerida y la huella del documento deben coincidir con el registro de aceptación.

## 12. Ley, jurisdicción y consumidor

Para una Organización cliente que contrate en el ámbito empresarial y no califique como consumidor, se propone la ley de la República de Costa Rica y la jurisdicción de los tribunales ordinarios de Limón, sin arbitraje ni mediación obligatoria previa. Si una persona u organización califica como consumidor, esta disposición no pretende excluir derechos irrenunciables, vías administrativas o judiciales, ni reglas imperativas de competencia. **Nota interna para el abogado:** confirmar la redacción B2B y adaptar el texto para relaciones de consumo conforme a la Ley 7472 y demás normas de orden público.

## 13. Contacto y disposiciones generales

Para soporte, usar **soporte@tonyml.com** o **+506 85456150**. Para privacidad, acceso, rectificación, actualización, oposición, eliminación u otras solicitudes, usar **antonyml2016@gmail.com** o el canal de la Organización cliente. El mismo correo general puede usarse para comunicaciones legales mientras se habilita un alias propio de AegisDesk. Si una disposición resulta inválida, las demás permanecen en vigor en la medida permitida. Este documento, el aviso de privacidad y el acuerdo con la Organización cliente integran el marco aplicable; la falta de ejercicio de un derecho no constituye renuncia.

## PLACEHOLDERS PENDIENTES

- Identidad jurídica, domicilio exacto y responsables de cada Organización cliente.
- Canal y procedimiento específico de la Organización cliente para solicitudes de titulares.
- Alias de privacidad y legal propios de AegisDesk, si se habilitan.
- [CRITERIO A DEFINIR CON ABOGADO] para el tope de responsabilidad.
- Aprobación de la base jurídica, textos de avisos y flujo de reaceptación.
- Confirmación legal de la redacción B2B y de su aplicación frente a consumidores.
