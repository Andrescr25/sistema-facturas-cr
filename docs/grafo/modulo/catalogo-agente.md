---
id: modulo/catalogo-agente
tipo: modulo
titulo: Catálogo del agente — el mismo orden que Gestión de Catálogo, de solo mirar
estado: vigente
archivos:
  - frontend/src/pages/CatalogoAgente.jsx
  - frontend/src/utils/catalogoAgentePersonalizacion.js
  - frontend/src/utils/promocionesCatalogoAgente.js
  - frontend/src/utils/buscarCatalogoAgente.js
  - frontend/src/components/catalogo-agente/TarjetaProductoAgente.jsx
  - frontend/src/components/catalogo-agente/BarraSuperior.jsx
  - backend/tests/subgruposCatalogoAgente.test.js
  - backend/tests/busquedaCatalogoAgente.test.js
  - backend/tests/catalogoClienteNuevo.test.js
  - backend/tests/promocionesCatalogoAgente.test.js
  - frontend/src/components/catalogo-agente/SelectorCliente.jsx
  - backend/tests/liquidacionSinStock.test.js
  - backend/src/modules/inventario-auditorias/productosNuevos.js
  - backend/tests/productosNuevos.test.js
  - frontend/src/components/inventario-auditoria/SeccionProductosNuevos.jsx
  - backend/src/modules/ventas/rotacion.js
  - backend/src/modules/catalogo-agente/pedidos-agente.service.js
  - backend/src/modules/catalogo-agente/catalogo-agente.service.js
  - backend/tests/catalogoAgenteSinCosto.test.js
  - backend/src/modules/precios/ofertasPorBaja.js
  - backend/src/modules/catalogo-agente/catalogo-agente.controller.js
  - frontend/src/utils/catalogoAgenteDb.js
  - frontend/src/hooks/useCatalogoAgente.js
  - backend/tests/catalogoAgenteIdsPropios.test.js
  - frontend/src/components/catalogo-agente/IntroduccionCategoria.jsx
  - frontend/src/components/catalogo-agente/introduccionCategoria.css
  - frontend/src/utils/entradaCategoria.js
  - frontend/src/utils/imagenesCategoriaCatalogo.js
  - backend/tests/categoriasVisuales.test.js
aristas:
  depende_de: [tabla/subcategoria, tabla/categoria-config, tabla/venta-linea, tabla/producto-nuevo-catalogo]
  relacionado: [modulo/gestion-catalogo, modulo/portal-clientes, decision/orden-canonico-compartido, leccion/dos-clases-de-oferta, leccion/fotos-del-catalogo-en-la-tablet, leccion/cache-con-ids-propios-no-borra-pendientes, leccion/lo-publico-no-lleva-costo-ni-margen]
medido: 2026-10-11
---

El catálogo que el agente le muestra al cliente. Es de solo mirar; el pedido
se toma en Facturación. No tiene controles para armarlo desde esta pantalla.
Cada categoría reúne sus familias (subcategorías) en una cuadrícula continua,
en el orden de `categoria_config.orden` y `subcategoria.orden`
— el mismo que ve Gestión de Catálogo, porque las dos pantallas usan las
mismas funciones ([[decision/orden-canonico-compartido]]). El agente recibe
ese orden de `GET /catalogo-agente/config-catalogo`; sin él (no sincronizó o
falló) todo sale alfabético.

2026-10-07, pedido del usuario: una subcategoría puede continuar en la misma
fila que la anterior. Solo una categoría nueva abre otro bloque; al final de
una categoría puede quedar una fila incompleta. `Cuadricula` recorre las
familias canónicas seguidas, sin reordenar por tamaño ni mezclar categorías.
La tarjeta dice la subcategoría en su propia línea, con hasta dos líneas
visibles y el nombre completo en `title`; los sueltos de una categoría con
familias dicen «Sin subcategoría» y siguen al final. Sin familias, no se
inventan rótulos. Se reutiliza `BloquesPorCategoria` para rebajas y nuevos.
Dos columnas en tablet/celular, tres desde `lg` y cuatro desde `xl`.
Selector móvil con nombre accesible «Elegir cliente».
[Validación visual y límites](../../informes/catalogo-agente-sin-huecos-2026-10-07.md).

Con un cliente elegido, el orden se personaliza (`ordenarCatalogoParaCliente`:
lo que suele comprar primero). Al quitar el cliente, vuelve al orden normal y
arriba de todo.

La búsqueda (`buscarCatalogoAgente.js`) descarta el agrupado y devuelve una
lista plana; Gestión de Catálogo hace lo mismo al buscar.

2026-10-11, pedido de navegación visual: cada bloque de categoría comienza
con `IntroduccionCategoria`, nombre, foto, contador y posición en la colección;
la cuadrícula empieza inmediatamente después. También se reutiliza en Cliente
nuevo, Ofertas y Nuevos, conservando su selección y orden. La imagen asignada
en Gestión gana; sin ella se aprovecha una foto de producto, o un fondo con
icono si tampoco hay fotos. Buscar sigue dando resultados planos. Elegir un
filtro de categoría vuelve arriba para mostrar su introducción.

Un único `IntersectionObserver` observa CABECERAS, nunca las tarjetas; al
entrar marca el DOM y deja de observar, sin actualizar estado React por el
scroll. CSS anima solo transform y opacity durante 650/950 ms. Todo es visible
sin observador y con movimiento reducido. `<picture>` elige la WebP móvil;
lazy/async/prioridad baja, altura reservada y respaldo si falla, sin bloquear
el recorrido. Las dos variantes se descargan al actualizar el catálogo y
viajan en su caché existente: [[leccion/fotos-del-catalogo-en-la-tablet]].
[Diseño, límites y pruebas](../../informes/catalogo-categorias-visuales-2026-10-11.md).

2026-10-07, segunda corrección del usuario: OFERTAS DENTRO DE SU FAMILIA.
En Todo no hay bloque superior de ofertas/rebajas/liquidación. El hook cruza
las mismas listas de promociones con la ficha, y `conPromocionesDelCatalogo`
adjunta `precioAntes`/`bajaPorcentaje` y/o `descuentoPorcentaje`, sin cambiar
precio base, clasificación ni caché cruda. Categorías, búsqueda, habituales,
perdidos y nuevos reciben esos datos. El filtro Ofertas reúne rebajas y
liquidación por categoría/familia, sin duplicar una ficha superpuesta; gana
la liquidación. La tarjeta Oferta usa rótulo con porcentaje, borde naranja
doble, fondo suave y área del precio resaltada; Liquidación conserva el
porcentaje y morado. No aplicar otra rebaja al precio ya rebajado.
[Informe y validación](../../informes/catalogo-ofertas-familias-2026-10-07.md).

PRODUCTOS NUEVOS (2026-09-27, decisión del usuario): conserva su sección
propia al principio, en el mismo orden por categoría. Es una lista
MANUAL (`producto_nuevo_catalogo`: qué producto, cuándo, quién) que se
administra en Auditoría de Inventario, pestaña "Productos nuevos" — agregar o
quitar, nada automático. Solo entra un producto activo y visible; uno que
después se desactiva queda en la lista marcado ("No sale: …") en vez de
borrarse solo. La lista usa `producto_id` propio y se quita por su entrada
`registroId`, incluso si no tiene ficha ([[tabla/producto-nuevo-catalogo]]).
La tablet baja solo los ids de `GET
/catalogo-agente/productos-nuevos`, abierta sin sesión como las rebajas; la
administración (`/inventario-auditorias/productos-nuevos`) pide sesión. No
entra en "Cliente nuevo".

CLIENTE NUEVO (2026-09-25). En el selector de clientes, "Cliente nuevo" va
siempre arriba y aparece al buscarlo. No es una ficha de cliente: es un id fijo
(`CLIENTE_NUEVO_ID`) sin compras. Con él elegido, en vez del catálogo
completo se ve `catalogoClienteNuevo`. Selecciona OFERTA (rebajas), LIQUIDACIÓN
(excesos), rotación A ("Lo más vendido") y B ("También se vende bien").
Desde el segundo pedido del 2026-10-07, `todos` reúne las cuatro selecciones
en una sola lista por categoría/familia: cada familia aparece una vez, con
promociones y normales juntos. Las cuatro listas anteriores y sus contadores
se conservan como filtros exclusivos, para no cambiar la selección original.
Ningún producto sale dos veces: liquidación gana y las promociones no se
repiten en A/B. C sin promoción queda solo en el buscador; C promocionada
sigue entrando como antes. Sin rotación disponible se conservan promociones
en su familia y el aviso de actualización. El buscador mira todo el catálogo.
La rotación baja al sincronizar de
`GET /catalogo-agente/rotacion` (solo ids, pide sesión) y se guarda en la
tablet como las rebajas. Es la rotación EN EL MOMENTO de
`ventas/rotacion.js` (unidades de los últimos 3 meses, la misma de
[[modulo/rentabilidad]]); la foto a mano de `producto_rotacion` ya no se usa.

Las ofertas en la tarjeta son DOS cosas distintas — ver
[[leccion/dos-clases-de-oferta]].

EN `independencia-alegra` (2026-09-24): los productos salen de `producto`, no
de Alegra ni de la caché, y la subcategoría de `producto.subcategoria_id`
(`conSubcategoria`), que es donde la pone Gestión de Catálogo en esta rama.
La categoría viaja en `itemCategory` —como la llama Alegra—, porque es lo
que lee `catalogoAgentePersonalizacion.js`: con `category` todo el catálogo
caía en "Otros".

LA TARJETA NO DICE NADA DEL STOCK (2026-09-25, decisión del usuario): el
negocio es intermediario, casi nunca tiene existencias y vende con el stock
del proveedor. "Agotado" y "Quedan N" se quitaron, y un producto en cero sale
en su lugar como cualquier otro. La única excepción es Liquidación, que sí es
mercadería física (sale sola cuando se acaba: `liquidacionSinStock.test.js`).

LA ACTUALIZACIÓN SIN SESIÓN Y LAS FOTOS: ver
[[leccion/fotos-del-catalogo-en-la-tablet]]. En esta pantalla un 401 no manda
al ingreso; el orden y la rotación (que piden sesión) se quedan como estaban
y la pantalla lo avisa.

SECCIÓN 12, PARTE 3 (2026-10-03): productos, historial por cliente, ofertas,
rebajas, lista manual y rotación A/B entregan ids propios, incluidos productos
y clientes sin Alegra. Un cliente activo sin compras entra con `p: []`.
La caché v3 invalida juntos los ids anteriores y conserva orden y fotos.
Productos, clientes y metadatos se reemplazan en una transacción; un fallo
de descarga o almacenamiento conserva la última copia válida. Ver
[[leccion/cache-con-ids-propios-no-borra-pendientes]].

SOLO LA COLA HISTÓRICA conserva el borde de Alegra. La migración no abre
`SistemaFacturasCR` ni borra pedidos o facturas pendientes. El servicio
reconoce campos antiguos explícitos y traduce por su correspondencia;
el contrato nuevo recibe `clienteId` y `productoId`, sin mezclarlos. Precio,
IVA y nombre salen del maestro. Cabecera y líneas se confirman juntas;
reenvíos devuelven el pedido original. Clientes los factura con el mismo
servicio propio del portal.

AL VOLVER LA CONEXIÓN (2026-10-04). El error que aparecía en la consola de
esta pantalla —`Cannot read properties of null (reading 'transaction')`— no
era del catálogo sino de Facturación sin señal: la base local del navegador
solo se abría en esa pantalla, y el regreso de la conexión se escucha en toda
la aplicación. Está explicado en [[modulo/facturacion-offline]]. El mismo
arreglo está en producción (`main` `e19c3e5`).

2026-10-05: ciclo explícito en portal/pedido de agente y facturación presencial;
al facturar se conserva el recorrido original. Colas antiguas intactas,
filtros de pedidos y validación por cuenta: [[modulo/pedidos-por-ciclo]].
