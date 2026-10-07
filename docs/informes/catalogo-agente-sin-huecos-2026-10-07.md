# Catálogo del agente: familias contiguas sin filas vacías

Pedido de José Andrés, **2026-10-07**, mientras configura Hacienda. En
«Cliente nuevo», una subcategoría de un solo producto abría su propia
cuadrícula y dejaba vacías las demás columnas. Ahora se completa la fila con
la siguiente subcategoría de la misma categoría, conservando el orden de
Gestión de Catálogo. Una categoría distinta empieza su propio bloque.

Ejemplo: dentro de Ferretería, los dos clavos, la hoja de segueta y las
amarras ahora comparten una fila de escritorio. Cada tarjeta identifica
Tornillos y Clavos, Herramientas Manuales o Amarras y Cuerdas. No se ordenan
las familias por cantidad para rellenar: siguen en su orden manual.

## Resultado y reutilización

- `Cuadricula` reúne las familias ya ordenadas; conserva prioridad de compra
  y recibe los mismos productos/estadísticas/precios.
- `BloquesPorCategoria` se reutiliza en Cliente nuevo, rebajas y nuevos.
  Catálogo completo usa la misma cuadrícula; búsqueda conserva parecido.
- Subcategoría en una línea propia sobre el nombre, hasta dos líneas y
  nombre completo en `title`. Sin clasificar se identifica cuando existen
  familias y permanece al final. Fotos mantienen su tamaño.
- Dos columnas en celular/tablet, tres desde 1.024 px y cuatro desde 1.280 px.
  Solo la última fila de una categoría puede quedar incompleta.
- Oferta, liquidación, A/B y búsqueda de C siguen con sus reglas anteriores.
  Liquidación prevalece cuando un producto tiene ambas promociones; el
  precio rebajado no vuelve a descontarse. No se añaden controles de pedido
  ni etiquetas de existencias.
- Selector de cliente accesible también cuando se oculta el texto en móvil.

## Verificación

Catálogo LOCAL real descargado mediante GET seguros de `localhost:3002`:
1.859 productos, 247 clientes, 18 rebajas; 429 recomendaciones exclusivas
tras cruzar promociones y rotación. La base local tiene cero liquidaciones
vigentes: se verificó ese estado y la liquidación con datos de borde solo
en la caché privada del navegador. Ningún demo insertado en PostgreSQL.

Siete recorridos Chromium: datos reales a 1.440/1.100/640/390 px y casos
pequeños a 1.440/640/390. Comparación del orden completo, rótulos,
coordenadas de cada tarjeta y número de columnas, sin huecos interiores ni
desbordamiento horizontal. Categoría aislada, selector Cliente nuevo,
pestañas, búsqueda de C, regreso al catálogo, recarga con selección
conservada y navegación con conexión cortada. Familias de uno/tres
productos, sin clasificar, sin categoría, promociones superpuestas y C.
Cero peticiones de escritura y cero excepciones JavaScript. Solicitudes
externas abortadas; fotos locales reales visibles en las capturas.

| Ancho | Columnas | Filas antes | Filas ahora |
|---|---:|---:|---:|
| 1.440 | 4 | 216 | 126 |
| 1.100 | 3 | 236 | 156 |
| 640 / 390 | 2 | 277 | 226 |

Filas de productos de las mismas 429 recomendaciones, calculadas con el
agrupado canónico; no incluyen los encabezados. 42 pruebas existentes de
orden, familias, Cliente nuevo y búsqueda aprobadas; build aprobado con los
avisos previos de tamaño de bundle y Browserslist. No se instaló nada.

## Alcance y relevo

Cambio de frontend; sin SQL, backend, Prisma, datos comerciales, servicios
reiniciados, mensajes reales ni limpieza semanal. Hacienda la configura el
usuario en paralelo; no se lee ni modifica su configuración fiscal.
No se acredita aceptación fiscal ni revisión final del usuario.

Operativo **96/3 (99 IDs)** e independencia **133/14 (147 IDs)** conservados.
Quedan RUT-03 (fuente LOCAL de Maps), CLI-10 y VAL-08 (revisiones humanas).
Memoria, instrucciones, grafo y checklists actualizados; las quince
decisiones originales siguen vigentes.

El usuario autorizó después llevar **este ajuste visual** a `main`. Se
aplica sobre la versión de producción en otra copia; no se trasladan avisos
de ids propios, backend ni el resto de la migración. La validación de esa
versión se hace sin entorno ni API/base de producción. Aplicación compartida
local: `http://localhost:5174/catalogo-agente`.

Evidencia privada: `/private/tmp/codex-catalogo-agente-20261007` con permisos
0700/0600; catálogos y capturas reales no se copian a Git.
