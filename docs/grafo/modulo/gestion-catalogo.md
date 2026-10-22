---
id: modulo/gestion-catalogo
tipo: modulo
titulo: Gestión de Catálogo — el rediseño de main, sobre el maestro propio
estado: vigente
archivos:
  - docs/informes/despliegue-main-2026-10-13.md
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
  - backend/src/modules/productos/categorias.imagenes.js
  - backend/src/modules/productos/categorias.imagen.optimizar.js
  - backend/tests/imagenCategoriaCalidad.test.js
  - backend/tests/imagenCategoriaLocal.test.js
  - frontend/src/components/gestion-catalogo/ImagenCategoria.jsx
  - frontend/src/hooks/useImagenCategoria.js
  - frontend/src/components/gestion-catalogo/DetalleCategoria.jsx
  - frontend/src/components/gestion-catalogo/FilaProducto.jsx
  - frontend/src/utils/rentabilidadFormato.js
  - backend/src/modules/ventas/rotacion.js
  - backend/tests/rotacionMensual.test.js
  - docs/informes/rotacion-productos-2026-10-14.md
  - docs/informes/rotacion-reciente-2026-10-14.md
  - backend/src/modules/productos/proveedoresProducto.service.js
  - backend/tests/proveedoresProducto.test.js
  - backend/tests/formatearMoneda.test.js
  - frontend/src/components/gestion-catalogo/ModalProducto.jsx
  - frontend/src/components/gestion-catalogo/ProveedoresProducto.jsx
  - frontend/src/hooks/useProveedoresProducto.js
  - frontend/src/services/productosService.js
  - frontend/src/utils/moneda.js
  - docs/informes/catalogo-proveedores-producto-2026-10-14.md
aristas:
  depende_de: [tabla/subcategoria, tabla/categoria-config, tabla/supplier-product-mapping]
  reemplaza: [decision/cambio-de-categoria-en-segundo-plano]
  relacionado: [modulo/marcas-catalogo, modulo/rentabilidad, tabla/venta-linea, modulo/catalogo-agente, decision/orden-canonico-compartido, decision/permisos-por-prefijo-mas-especifico, leccion/precio-sin-iva-costo-con-iva, leccion/ids-propios-y-de-alegra-no-se-mezclan, tabla/alegra-products-cache]
medido: 2026-10-22
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
- La rotación de cada fila (unidades al mes) usa desde el 2026-10-14 la
  misma rotación de Rentabilidad: **unidades vendidas en los últimos30
  días**, incluido el actual, por aclaración posterior al caso real de
  un producto agotado. Reemplaza la media de meses completos inicial.
  Categoría y búsqueda leen `SQL_ROTACION_MENSUAL` desde `venta_linea`, por
  `producto.id`; sin ventas dan cero. El formato compartido conserva los
  decimales y muestra «Últimos30 días». No se lee la foto antigua de
  `producto_rotacion`. [Verificación](../../informes/rotacion-reciente-2026-10-14.md).
- Los componentes de `main` siguen hablando con los nombres de la caché
  (`name`, `imageUrl`…); la traducción está en UN solo lugar, `aFila` de
  `useListaCatalogo.js`, y el id es el propio.

LO QUE SE REUTILIZA SIN COPIAR

`subcategoria` y `categoria_config` son tablas locales en las dos ramas,
colgadas del NOMBRE de la categoría. Crear, renombrar y ordenar
subcategorías, y el orden y el nombre visible de las categorías, usan
`productos/taxonomiaTablas.js`, extraído del catálogo antiguo al retirarlo.
Renombrar una categoría DE VERDAD (pestaña
Categorías) arrastra ese nombre en las dos tablas
(`productos.service.editarCategoria`).

2026-10-11: al abrir una categoría, el botón **Imagen** está junto a su nombre
y lápiz. Abre vista previa, elegir/reemplazar, guardar o quitar. JPG/PNG/WebP,
máximo 8 MiB; el servidor valida los bytes y limita la decodificación a 24
megapíxeles, corrige orientación y elimina metadatos. Para la transición de
pantalla completa guarda dos WebP estáticos: escritorio hasta 1920×1080/800
KiB y móvil vertical hasta 960×1280/400 KiB. Calidad 84, luego 80/76 si hace
falta; solo después reduce a 1600/1440 o 800/720 de ancho. Si ni eso cumple,
rechaza la foto en lugar de guardarla como una miniatura borrosa. Nunca
agranda una fuente pequeña. El motivo central se conserva en ambos recortes.
Las fotos ya comprimidas con la versión anterior requieren volver a subir su
original. Selección, vista previa y envío viven en `useImagenCategoria.js`.
`POST/DELETE /maestro/categorias/:id/imagen` requieren Gestión de Catálogo.
No se admite URL externa ni se modifica la foto de un producto.

El servicio bloquea `categoria_producto` por id y luego `categoria_config`
por el nombre actual, igual que el renombre real: nombre visible, orden e
imagen sobreviven al renombre/reordenamiento. Bitácora y configuración van
en la misma transacción; si falla borra los archivos nuevos y conserva los
anteriores. Al reemplazar/quitar solo borra las variantes de esa categoría,
después del commit. La lectura funciona antes de SQL 055; guardar sin esa
columna devuelve 503 y conserva la imagen previa. Comprueba el esquema antes
de comprimir o guardar archivos; no ejecuta migraciones desde la petición.
SQL 055 se aplica explícitamente antes del despliegue. El 503 reportado en
producción el 2026-10-11 corresponde a ese paso pendiente, no al tamaño del
archivo. Pruebas de calidad siempre activas en `imagenCategoriaCalidad.test.js`
y con PostgreSQL desechable/multipart en `imagenCategoriaLocal.test.js`,
incluyendo reproducir el 503 y recuperar la misma subida al aplicar SQL 055.

LO QUE SOLO SE VE CONTRA UNA BASE

Mover una subcategoría falló la primera vez con "inconsistent types deduced
for parameter $2": el mismo parámetro en el SET y en una subconsulta. Los
dobles no lo ven; por eso `taxonomiaCatalogo.test.js` tiene pruebas contra la
base local (`PROBAR_BASE_LOCAL=1`) que revierten todo al terminar.

Al integrar el retiro de `catalogo/` (2026-10-04), esa prueba aún limpiaba
los dos módulos borrados en vez de `taxonomiaTablas.js`. El helper nuevo
conservaba la conexión falsa de un caso anterior y la prueba real fallaba
con un id inexistente. Se limpia la dependencia actual antes de cada caso
y al montar PostgreSQL; no se cambió el servicio para ocultar ese fallo.

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

ACTIVO Y OCULTO SON DOS COSAS (2026-10-13). «Desactivar» saca un producto de
la venta; «Ocultar» lo saca solo de los catálogos que ven los clientes y el
agente, y se puede seguir facturando. Reactivar uno que además estaba oculto
lo deja «Activo · Oculto en los catálogos»: desde esa fecha aparece en
Facturación igual (antes no, ver [[modulo/facturacion-offline]], "LA COPIA DEL
CATÁLOGO SE RENUEVA SOLA"), y para que vuelva a los catálogos hay que tocar
«Mostrar».



## Despliegue autorizado — 2026-10-13

El usuario pide llevar todo a main. Codex aplica 055/057/058 en producción
con respaldo restaurable y ensayo local: 144 tablas conservadas y los seis
cuerpos de función verificados. 056 ya estaba aplicada. El bloqueo anterior
por migraciones queda resuelto; la publicación incluye rotación, Reporte
Clientes, Preventa, Carga/entregas y Proveedores. Ver
[registro del despliegue](../../informes/despliegue-main-2026-10-13.md).
Los párrafos de entregas previas describen su estado histórico al publicarlas.


## Proveedores en Editar producto — 2026-10-14

`ModalProducto` recupera las pestañas **Datos del producto / Proveedores**.
Cada relación muestra proveedor por cédula, nombre/código como se facturó,
último costo pagado por unidad propia **con descuento e IVA real**, moneda y
fecha. Si vende por caja o con factor fraccionario, se muestra además el costo
en su unidad y el factor. No hay costo inventado para relaciones sin facturas.

La carga ocurre solo al abrir Proveedores; conserva resultado y formulario al
volver a Datos, cancela lecturas al cerrar y permite reintentar. En un producto
nuevo no hay pestaña. Componentes dibujan, gancho carga y servicio consulta.

`GET /maestro/productos/:id/proveedores` exige Gestión de Catálogo. Reutiliza
la misma lectura que Gestionar Relaciones, ahora SQL por `producto.id`:
dos consultas independientemente del número de proveedores. La última línea
debe coincidir en producto, cédula y código y estar RELACIONADA; cambiar el
mapeo no transfiere el costo de otro producto. No se limita a cinco líneas:
regalías recientes no tapan el costo pagado anterior. Una compra registrada
aporta su fotografía de factor/importes; una anulada no aporta costo.
Sin SQL nuevo ni consultas/escrituras a producción.

[Pruebas y alcance](../../informes/catalogo-proveedores-producto-2026-10-14.md).


## Marcas y presentaciones — 2026-10-22

Gestión conserva categorías, subcategorías y filas existentes. El botón
«Marcas» de cada subcategoría permite nombrar una agrupación, seleccionar sus
productos existentes y subir una imagen general independiente. En el agente
se muestra marca/foto/lista de presentaciones con IVA; tocar una presentación
abre su fotografía individual sin consultar al servidor. Ver
[[modulo/marcas-catalogo]]. Desarrollo local; SQL064 pendiente en producción.
