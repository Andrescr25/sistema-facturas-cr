---
id: modulo/catalogo-agente
tipo: modulo
titulo: Catálogo del agente — el mismo orden que Gestión de Catálogo, de solo mirar
estado: vigente
archivos:
  - frontend/src/pages/CatalogoAgente.jsx
  - frontend/src/utils/catalogoAgentePersonalizacion.js
  - frontend/src/utils/buscarCatalogoAgente.js
  - frontend/src/components/catalogo-agente/TarjetaProductoAgente.jsx
  - frontend/src/components/catalogo-agente/BarraSuperior.jsx
  - backend/tests/subgruposCatalogoAgente.test.js
  - backend/tests/busquedaCatalogoAgente.test.js
  - backend/tests/catalogoClienteNuevo.test.js
  - frontend/src/components/catalogo-agente/SelectorCliente.jsx
  - backend/tests/liquidacionSinStock.test.js
  - backend/src/modules/inventario-auditorias/productosNuevos.js
  - backend/tests/productosNuevos.test.js
  - frontend/src/components/inventario-auditoria/SeccionProductosNuevos.jsx
  - frontend/src/services/indexedDBService.js
  - frontend/src/services/facturacionService.js
  - backend/tests/baseLocalAbierta.test.js
  - backend/src/modules/ventas/rotacion.js
aristas:
  depende_de: [tabla/alegra-products-cache, tabla/subcategoria, tabla/categoria-config, tabla/venta-historico]
  relacionado: [modulo/gestion-catalogo, decision/orden-canonico-compartido, leccion/dos-clases-de-oferta, leccion/fotos-del-catalogo-en-la-tablet, leccion/lo-publico-no-lleva-costo-ni-margen]
medido: 2026-10-07
---

El catálogo que el agente le muestra al cliente. Es de solo mirar: el
pedido se toma en Facturación. Cada categoría reúne sus familias
(subcategorías) en una cuadrícula continua, en el orden de
`categoria_config.orden` y `subcategoria.orden`
— el mismo que ve Gestión de Catálogo, porque las dos pantallas usan las
mismas funciones ([[decision/orden-canonico-compartido]]). El agente recibe
ese orden de `GET /catalogo-agente/config-catalogo`; sin él (no sincronizó o
falló) todo sale alfabético.

2026-10-07, pedido y autorización explícita del usuario para main: las
subcategorías pueden continuar en la misma fila. Solo el cambio de categoría
abre otro bloque; al final de la categoría puede quedar una fila incompleta.
`Cuadricula` recorre las familias canónicas seguidas, sin ordenarlas por
tamaño. Cada tarjeta dice su subcategoría en una línea propia, hasta dos
líneas y nombre completo en `title`; los sueltos de una categoría con
familias dicen «Sin subcategoría» y siguen al final. `BloquesPorCategoria`
también se reutiliza para rebajas y nuevos. Se conserva el catálogo de
Cliente nuevo, sus cuatro secciones exclusivas, búsqueda y recomendaciones.
Dos columnas en tablet/celular, tres desde `lg`, cuatro desde `xl`; selector
móvil con nombre accesible. No se trasladan hooks, ids ni caché de la rama
de migración. [Validación y alcance](../../informes/catalogo-agente-sin-huecos-2026-10-07.md).

Con un cliente elegido, el orden se personaliza (`ordenarCatalogoParaCliente`:
lo que suele comprar primero). Al quitar el cliente, vuelve al orden normal y
arriba de todo.

La búsqueda (`buscarCatalogoAgente.js`) descarta el agrupado y devuelve una
lista plana; Gestión de Catálogo hace lo mismo al buscar.

"Bajamos el precio" también va en el orden del catálogo (2026-09-24): un
bloque por categoría y, dentro, por subcategoría (`enOrdenDelCatalogo`, que
es `ordenarCatalogoParaCliente` sin cliente). Antes iba por porcentaje de
rebaja y los productos salían revueltos. "Liquidación" sigue por porcentaje.

PRODUCTOS NUEVOS (2026-09-27, decisión del usuario): sección propia justo
después de "Bajamos el precio", en el mismo orden por categoría. Es una lista
MANUAL (`producto_nuevo_catalogo`: qué producto, cuándo, quién) que se
administra en Auditoría de Inventario, pestaña "Productos nuevos" — agregar o
quitar, nada automático. Solo entra un producto activo y visible; uno que
después se desactiva queda en la lista marcado ("No sale: …") en vez de
borrarse solo. La tablet baja solo los ids de `GET
/catalogo-agente/productos-nuevos`, abierta sin sesión como las rebajas; la
administración (`/inventario-auditorias/productos-nuevos`) pide sesión. No
entra en "Cliente nuevo".

CLIENTE NUEVO (2026-09-25). En el selector de clientes, "Cliente nuevo" va
siempre arriba y aparece al buscarlo. No existe en Alegra: es un id fijo
(`CLIENTE_NUEVO_ID`) sin compras. Con él elegido, en vez del catálogo
completo se ve `catalogoClienteNuevo`: OFERTA (las rebajas, con la etiqueta
"OFERTA" en vez del porcentaje), LIQUIDACIÓN (los excesos, con su
descuento), después rotación A ("Lo más vendido") y después B ("También se
vende bien"), cada una por categoría y subcategoría. Ningún producto sale dos
veces: la liquidación gana (su descuento se cobra encima del precio rebajado,
así que es el precio real), y lo de oferta no se repite en A/B. La C no se
muestra, y el buscador sigue viendo todo el catálogo. La rotación baja al sincronizar de
`GET /catalogo-agente/rotacion` (solo ids, pide sesión) y se guarda en la
tablet como las rebajas. Es la rotación EN EL MOMENTO de
`ventas/rotacion.js` (unidades de los últimos 3 meses, la misma de
[[modulo/rentabilidad]]); la foto a mano de `producto_rotacion` ya no se usa.

Las ofertas en la tarjeta son DOS cosas distintas — ver
[[leccion/dos-clases-de-oferta]].

LA TARJETA NO DICE NADA DEL STOCK (2026-09-25, decisión del usuario): el
negocio es intermediario, casi nunca tiene existencias y vende con el stock
del proveedor. "Agotado" y "Quedan N" se quitaron, y un producto en cero sale
en su lugar como cualquier otro. La única excepción es Liquidación, que sí es
mercadería física (sale sola cuando se acaba: `liquidacionSinStock.test.js`).

LA ACTUALIZACIÓN SIN SESIÓN Y LAS FOTOS: ver
[[leccion/fotos-del-catalogo-en-la-tablet]]. En esta pantalla un 401 no manda
al ingreso; el orden y la rotación (que piden sesión) se quedan como estaban
y la pantalla lo avisa.

AL VOLVER LA CONEXIÓN (2026-10-04). En esta pantalla aparecía en la consola
`Cannot read properties of null (reading 'transaction')`. No era del catálogo:
`facturacionService` se carga con la aplicación y escucha `online` en TODAS las
pantallas para mandar las facturas hechas sin señal, pero la base local del
navegador solo la abría la pantalla de Facturación. Fuera de ahí el intento
reventaba y las pendientes no salían hasta que alguien abría Facturación.

- `indexedDBService.abierta()` abre la base si hace falta (una sola vez aunque
  la pidan dos a la par) y todos sus métodos pasan por ahí.
- Como esta pantalla se usa con la sesión vencida: sin sesión no se manda
  nada, y un 401 a mitad del envío lo corta sin marcar ninguna factura como
  rechazada (`sinSesion` en el resultado).
- Las facturas y las ediciones pendientes se mandan una después de la otra;
  lanzadas a la par compartían `syncInProgress` y las ediciones nunca salían.

`baseLocalAbierta.test.js` carga el servicio de verdad sobre una IndexedDB
simulada. Verificado en Chromium cortando y devolviendo la conexión acá.
