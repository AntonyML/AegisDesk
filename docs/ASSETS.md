BORRADOR — REQUIERE REVISIÓN DE ABOGADO ANTES DE PRODUCCIÓN

# Procedencia de activos

Registro inicial basado en los archivos presentes en el repositorio. Todo elemento sin evidencia verificable debe permanecer marcado como **SIN PROCEDENCIA DEMOSTRABLE** hasta que el titular aporte la fuente, licencia y permiso de distribución.

Este inventario comprende activos de AegisDesk. No incluye ni reclama titularidad sobre SIDC, sus interfaces, datos, imágenes o documentación institucional.

| Activo | Ubicación | Uso | Procedencia/estado |
|---|---|---|---|
| Icono del shell | `shell/assets/aegis_shell.ico`, `shell/internal/assets/aegis_shell.ico` | Instalador, ejecutable, acceso directo y ventana; derivados del PNG por `shell/generate-branding.ps1` | SIN PROCEDENCIA DEMOSTRABLE del original |
| Icono anterior de AegisDesk | `shell/assets/aegisdesk.ico` | Histórico; ya no se distribuye en el instalador | SIN PROCEDENCIA DEMOSTRABLE |
| PNG de marca | `shell/assets/aegis_shell.png` | Fuente única del logo del shell y del instalador | SIN PROCEDENCIA DEMOSTRABLE |
| Imágenes del asistente | `shell/assets/wizard-brand.bmp`, `shell/assets/wizard-brand-small.bmp` | Derivadas del PNG, conservando proporciones, por `shell/generate-branding.ps1` | SIN PROCEDENCIA DEMOSTRABLE del original |
| Fuente Segoe UI | Referenciada por la UI Windows | Renderizado del sistema operativo | Fuente del sistema; no se distribuye en el instalador según el script actual |
| Textos de interfaz | `shell/internal/ui/**` | Soporte, avisos y diálogos | Autoría interna no documentada; confirmar titularidad |
| Textos legales | `docs/legal/**` | Términos y avisos | Borradores nuevos de este repositorio; requieren revisión |
| Código o ideas inspiradas en repositorios externos | No se identificó un bloque distribuido como `open-attest` en el shell revisado | — | No afirmar procedencia; revisar historial y dependencias antes de producción |

El build regenera los derivados y el recurso del ejecutable para evitar iconos obsoletos. En Windows, `./shell/generate-branding.ps1 -Check` verifica que los derivados coincidan con el PNG sin modificarlos.

## PLACEHOLDERS PENDIENTES

- Autor, fecha, licencia y permiso de cada icono/imagen.
- Titularidad o licencia de textos y diseños de interfaz.
- Búsqueda de historial y revisión legal de inspiración o código externo.
