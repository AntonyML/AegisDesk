# Reporte de Auditoría de Licencias de Software — AegisDesk Worker

**Fecha:** 29 de septiembre de 2026

**Componente:** `worker/` (Cloudflare Workers API & Admin Service)

**Clasificación de Auditoría:** Revisión técnica preliminar de licencias OSS; requiere validación jurídica y de artefactos antes de producción.

---

## 1. Distinción Fundamental: LGPL y protección de datos

Es imperativo no confundir los dos acrónimos presentes en el proyecto:
- **Protección de datos personales:** El proyecto debe revisarse principalmente bajo el marco aplicable a Costa Rica y el aviso canónico de `docs/legal/`; no se debe afirmar una equivalencia automática con LGPD o GDPR.
- **LGPL (GNU Lesser General Public License):** Licencia de software libre con copyleft débil creada por la Free Software Foundation (FSF). Rige los términos bajo los cuales el código de terceros puede ser vinculado, modificado y redistribuido.

---

## 2. Dependencias de Producción (`dependencies`)

Las dependencias de producción son aquellas empaquetadas e interpretadas en tiempo de ejecución por el runtime de Cloudflare Workers.

| Nombre del Paquete | Versión Instalada | Licencia SPIX / SPDX | Propósito y Uso en AegisDesk | Embebida en Bundle (`dist/index.js`) |
| :--- | :--- | :--- | :--- | :---: |
| [`drizzle-orm`](https://www.npmjs.com/package/drizzle-orm) | `0.45.3` | **Apache-2.0** | ORM ligero y constructor de consultas SQL tipadas contra Cloudflare D1. | **SÍ** |
| [`hono`](https://www.npmjs.com/package/hono) | `4.13.10` | **MIT** | Framework web ultrarrápido y liviano para Cloudflare Workers. Manejo de enrutamiento y middleware. | **SÍ** |
| [`jose`](https://www.npmjs.com/package/jose) | `6.2.12` | **MIT** | Criptografía WebCrypto universal para firma y verificación de tokens JWT/JWS (EdDSA / Ed25519) y validación de Cloudflare Access. | **SÍ** |
| [`zod`](https://www.npmjs.com/package/zod) | `4.6.5` | **MIT** | Validación de esquemas en tiempo de ejecución, saneamiento de payloads de API y formularios de soporte. | **SÍ** |

*Nota de verificación:* La ejecución de `npm ls --omit=dev --all` confirma que **ninguna** de las dependencias de producción introduce dependencias transitivas instaladas en `node_modules` (0 subdependencias transitivas activas).

---

## 3. Dependencias de Desarrollo (`devDependencies`)

Herramientas utilizadas exclusivamente durante el ciclo de desarrollo local, compilación, verificación tipada y ejecución de pruebas automatizadas. **Ninguna de estas herramientas se empaqueta ni se distribuye en el runtime de producción.**

| Nombre del Paquete | Versión | Licencia | Propósito |
| :--- | :--- | :--- | :--- |
| `@biomejs/biome` | `2.2.4` | **MIT OR Apache-2.0** | Formateador y linter de alto rendimiento. |
| `@cloudflare/vitest-plugin` | `1.3.1` | **MIT OR Apache-2.0** | Integración del entorno de ejecución de Cloudflare Workers con Vitest. |
| `@types/node` | `24.5.0` | **MIT** | Definiciones de tipos para APIs de Node.js. |
| `drizzle-kit` | `0.31.4` | **Apache-2.0** | Herramienta CLI para generación y ejecución local de migraciones D1. |
| `typescript` | `5.9.2` | **Apache-2.0** | Compilador y comprobador estático de tipos. |
| `vitest` | `4.1.11` | **MIT** | Framework de pruebas unitarias y de integración. |
| `wrangler` | `4.143.0` | **MIT OR Apache-2.0** | CLI oficial de desarrollo, bundling (esbuild) y despliegue de Cloudflare Workers. |

### Dependencias Transitivas de Desarrollo con Licencias No Permisivas

Al auditar `package-lock.json`, se detectaron paquetes secundarios incorporados por herramientas de testing local:

1. **`@img/sharp-libvips-*` (`1.3.3`) / `@img/sharp-*` (`0.35.4`):**
   - **Licencia:** **LGPL-3.0-or-later** / **Apache-2.0 AND LGPL-3.0-or-later**.
   - **Origen:** Dependencia opcional de `miniflare` (invocado por `@cloudflare/vitest-plugin` para emular transformaciones de imágenes de Cloudflare Images en pruebas locales).
   - **Embebido en Bundle:** **NO**. Es una herramienta de tooling local que nunca se incluye en el artefacto final.
2. **`lightningcss` / `lightningcss-*` (`1.33.0`):**
   - **Licencia:** **MPL-2.0** (Mozilla Public License 2.0).
   - **Origen:** Dependencia transitiva del bundler interno de `vite` / `vitest` para procesamiento de CSS.
   - **Embebido en Bundle:** **NO**. Se ejecuta en tiempo de pruebas en la máquina del desarrollador / CI.

---

## 4. Análisis del Bundle de Producción (`wrangler deploy --dry-run`)

Se generó el bundle de producción real mediante:
```powershell
npx wrangler deploy --dry-run --outdir "$env:TEMP/wrangler-bundle-check"
```

El análisis forense del archivo empaquetado resultante (`index.js`, ~1.28 MB desminificado) arrojó los siguientes resultados:
- **Dependencias embebidas identificadas:** Exclusivamente código fuente transpilado de `hono`, `drizzle-orm`, `jose` y `zod`, además de la lógica de negocio propia en `worker/src/`.
- **Dependencias con copyleft (LGPL, GPL, AGPL, MPL, SSPL):** **CERO (0)**. Ningún paquete con licenciamiento copyleft o restrictivo se encuentra en el artefacto desplegable.
- **Detección de términos de licencias virales:** La búsqueda en el AST y contenido textual de `index.js` confirma la ausencia total de cláusulas GPL, LGPL, AGPL o Mozilla Public License.

---

## 5. Análisis de Riesgo Jurídico y Compatibilidad

### 5.1 Dependencias no MIT/BSD (Apache-2.0)
Tanto `drizzle-orm` como `typescript` y `drizzle-kit` emplean **Apache-2.0**.
- **Observación técnica:** Apache-2.0 suele permitir uso comercial, modificación y distribución bajo sus condiciones; el abogado debe validar el texto de licencia concreto y conservar los avisos y licencias aplicables.

### 5.2 Escenario 1: Modelo SaaS en Cloudflare Workers (Arquitectura Actual)
- **Evaluación técnica preliminar:** No se identificaron dependencias de producción GPL/LGPL en el inventario revisado. Esto no constituye una conclusión jurídica ni elimina la necesidad de revisar versiones, avisos y el bundle final.
- **Fundamento:** El código del Worker se ejecuta en la infraestructura de computación perimetral propia del proveedor (Cloudflare SaaS/PaaS). Los clientes interactúan únicamente a través de la red (HTTP/REST y páginas renderizadas).
  - La ausencia de una dependencia identificada bajo **AGPL-3.0** reduce un riesgo técnico del inventario, pero no permite concluir por sí sola qué obligaciones legales aplican al servicio o a su distribución.
  - Las 4 dependencias directas (`hono`, `drizzle-orm`, `jose`, `zod`) son todas de tipo permisivo (MIT y Apache-2.0).

### 5.3 Escenario 2: Distribución On-Premise a Clientes (Self-Hosted / Cloudflare for Enterprise)
- **Evaluación técnica preliminar:** Las dependencias de producción identificadas son permisivas según el inventario revisado; la distribución comercial requiere conservar avisos y obtener validación jurídica.
- **Fundamento:** Si en el futuro AegisDesk decide empaquetar y entregar el Worker a clientes corporativos para que lo desplieguen en sus propias cuentas de Cloudflare o en contenedores on-premise:
  - **Enlace Estático:** En JavaScript/TypeScript, el bundling vía esbuild equivale funcionalmente a un enlace estático. Si existiera una librería **GPL**, esto convertiría todo el bundle en una obra derivada sujeta a GPL (obligando a liberar el código de AegisDesk). Si fuera **LGPL**, obligaría a proveer un mecanismo para que el cliente relinkee la librería con su propia versión modificada.
  - **Estado Real de AegisDesk:** El inventario actual no identifica dependencias de producción bajo GPL o LGPL. Antes de una distribución comercial privativa deben verificarse el bundle, los textos de licencia, los avisos y las obligaciones contractuales aplicables.

---

## 6. Conclusiones y Recomendaciones

1. **Siguiente revisión:** El inventario técnico debe contrastarse con el bundle final, los textos de licencia y la política del titular antes de afirmar cumplimiento.
2. **Higiene de Dependencias:** Mantener la política de no incorporar dependencias en `dependencies` sin previa validación automatizada de licencias.
3. **CI Check Recomendado:** Para garantizar que futuros desarrollos no introduzcan paquetes con licencias restrictivas, se recomienda agregar al pipeline un paso de verificación de licencias (ej. `license-checker-rseidelsohn` o comando npm audit de licencias).
