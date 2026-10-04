---
id: modulo/gestion-catalogo
tipo: modulo
titulo: Gestión de Catálogo — el rediseño de main, sobre el maestro propio
estado: vigente
archivos:
  - backend/migrations/independencia/030_subcategoria_en_producto.sql
  - backend/src/modules/productos/taxonomia.service.js
  - backend/src/modules/productos/productos.routes.js
  - backend/src/modules/productos/productos.service.js
  - backend/src/modules/productos/taxonomiaTablas.js
  - backend/src/modules/productos/imagenesSugeridas.js
  - backend/tests/taxonomiaTablas.test.js
  - backend/tests/imagenesSugeridas.test.js
  - frontend/src/pages/GestionCatalogo.jsx
  - frontend/src/hooks/useTaxonomiaCatalogo.js
  - frontend/src/hooks/useListaCatalogo.js
  - frontend/src/hooks/useAccionesLote.js
  - frontend/src/hooks/useFichaProducto.js
  - backend/tests/taxonomiaCatalogo.test.js
  - backend/tests/maestroFotosYReferencias.test.js
aristas:
  depende_de: [tabla/subcategoria, tabla/categoria-config, tabla/supplier-product-mapping]
  reemplaza: [decision/cambio-de-categoria-en-segundo-plano]
  relacionado: [modulo/catalogo-agente, decision/orden-canonico-compartido, decision/permisos-por-prefijo-mas-especifico, leccion/precio-sin-iva-costo-con-iva, leccion/ids-propios-y-de-alegra-no-se-mezclan, tabla/alegra-products-cache]
medido: 2026-10-04
---

QUÉ ES

`/gestion-catalogo` con el diseño que se hizo en `main` (tarjetas de
resumen que filtran, cuadrícula de categorías, al entrar las subcategorías
como secciones, barra de lote), traído a esta rama el 2026-09-24 y conectado
al maestro propio (`producto`) en vez de a la caché de Alegra.

LO QUE CAMBIA RESPECTO DE `main`

- La subcategoría vive en `producto.subcategoria_id` (migración 030), no en
  `alegra_products_cache`. `cargar-productos.js` copia la de la caché en cada
  carga mientras `main` siga clasificando allá.
- Todo va por `/maestro/*` (`taxonomia.service.js`): árbol, productos de una
  categoría, búsqueda, lotes y subcategorías. Cambiar de categoría es un
  UPDATE inmediato; allá es un trabajo de fondo que le escribe a Alegra (por
  eso `useAccionesLote` devuelve `trabajo: null` siempre).
- La ficha es la de esta rama (`ModalProducto` + `useFichaProducto`): CABYS,
  impuesto, unidad, medicamento, ocultar y dar de baja. Los ocultos y los
  dados de baja no cuentan en las tarjetas —el agente tampoco los ve— y se
  encuentran con el filtro de estado del buscador.
- La rotación de cada fila (unidades al mes) es en tiempo real
  (`ventas/rotacion.js`, 3 meses), igual que en `main` desde el 2026-09-25:
  la foto de `producto_rotacion` ya no se lee. Se cruza por `alegra_id`
  porque las ventas todavía vienen de Alegra (sección 12).
- Los componentes de `main` siguen hablando con los nombres de la caché
  (`name`, `imageUrl`…); la traducción está en UN solo lugar, `aFila` de
  `useListaCatalogo.js`, y el id es el propio.

LO QUE SE REUTILIZA SIN COPIAR

`subcategoria` y `categoria_config` son tablas locales en las dos ramas,
colgadas del NOMBRE de la categoría. Crear, renombrar y ordenar
subcategorías, y el orden y el nombre visible de las categorías, usan los
servicios de `catalogo/` tal cual. Renombrar una categoría DE VERDAD (pestaña
Categorías) arrastra ese nombre en las dos tablas
(`productos.service.editarCategoria`).

LO QUE SOLO SE VE CONTRA UNA BASE

Mover una subcategoría falló la primera vez con "inconsistent types deduced
for parameter $2": el mismo parámetro en el SET y en una subconsulta. Los
dobles no lo ven; por eso `taxonomiaCatalogo.test.js` tiene pruebas contra la
base local (`PROBAR_BASE_LOCAL=1`) que revierten todo al terminar.

## Agregar una marca: el código que sigue se cuenta en el maestro

"Agregar marcas" abre el formulario con el código siguiente de la serie
(`305-001`, `305-002`…): el menor número libre, con tres dígitos
(`GET /maestro/productos/siguiente-referencia`, `siguienteReferenciaDeMarca`).

Hasta el 2026-10-04 se contaba sobre la caché de Alegra, que en esta rama no
se entera de los productos creados acá: después de agregar una marca volvía a
proponer el mismo código, y el guardado lo rechazaba por repetido. Cuenta
también los inactivos, para que un código dado de baja no se reuse.

La misma mudanza tuvo la foto de cada línea de Facturas en Bodega
(`GET /catalogos/imagenes-por-referencia`): las de la caché eran direcciones
de Alegra ya vencidas. Ver [[tabla/alegra-products-cache]].

## La Gestión de Catálogo vieja se retiró (2026-10-04)

`backend/src/modules/catalogo` —la pantalla de cuando el catálogo era de
Alegra— seguía montado en `/alegra/catalog` con 24 rutas: árbol y listas
desde la caché, subcategorías sobre la caché, y editar, borrar, duplicar y
cambiar de categoría productos EN ALEGRA. Las pantallas de esta rama usaban
dos. Se borró entero (1.942 líneas) y lo que seguía vivo se mudó:

| Qué | Dónde quedó |
|---|---|
| Orden y nombre visible de las categorías; subcategorías | `productos/taxonomiaTablas.js` |
| Buscar fotos sugeridas | `GET /catalogos/imagenes-sugeridas` (`productos/imagenesSugeridas.js`) |
| La miniatura de cada sugerencia | `GET /catalogos/imagen-proxy`, pública y solo del CDN de Brave |

La miniatura ahora pasa por `utils/descargarImagen`, que no sigue una
redirección hacia la red interna; antes se bajaba con axios a secas.

Con esto el catálogo del agente dejó de pedirle las categorías a Alegra en
vivo: ver [[tabla/categoria-config]].

