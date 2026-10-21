---
id: modulo/relacionar-productos
tipo: modulo
titulo: Relacionar Productos — la línea del proveedor se cuelga de `producto.id`
estado: vigente
archivos:
  - backend/src/modules/productos-revision/relacionPropia.js
  - backend/src/modules/productos-revision/productoDesdeLinea.js
  - backend/src/modules/productos-revision/productos-revision.service.js
  - backend/src/modules/productos/proveedoresProducto.service.js
  - backend/src/modules/productos-revision/productos-revision.controller.js
  - backend/src/modules/productos-revision/productos-revision.routes.js
  - backend/services/databaseService.js
  - backend/services/emailService.js
  - backend/src/modules/precios/costoHistorico.js
  - backend/src/modules/precios/costoDerivado.js
  - backend/migrations/independencia/038_relacion_de_compra_por_producto_propio.sql
  - backend/migrations/independencia/039_avance_de_la_factura_desde_sus_lineas.sql
  - backend/tests/relacionPropia.test.js
  - backend/tests/productoDesdeLinea.test.js
  - backend/tests/buzonPorProductoPropio.test.js
  - backend/tests/dobles/buzonEnTransaccion.js
  - backend/tests/buscarRelaciones.test.js
  - backend/tests/costoDerivadoPropio.test.js
  - frontend/src/hooks/useRelacionarProductos.js
  - frontend/src/hooks/useGestionarRelaciones.js
  - frontend/src/components/relacionar-productos/ModalCrearProducto.jsx
  - frontend/src/components/relacionar-productos/ModalBuscarProducto.jsx
aristas:
  depende_de: [tabla/supplier-product-mapping, tabla/facturas-proveedores]
  bloqueado_por: [bloqueo/prisma-no-se-regenera, bloqueo/conteo-fisico]
  relacionado: [modulo/revision-precios, modulo/compras, modulo/rentabilidad, modulo/gestion-catalogo, decision/el-avance-de-la-factura-sale-de-sus-lineas, leccion/ids-propios-y-de-alegra-no-se-mezclan, leccion/el-doble-de-prisma-no-valida-tipos, leccion/proveedor-por-cedula]
medido: 2026-10-14
---

## Buscar el producto propio, rediseñado — 2026-10-20

Pedido del usuario: «haz bien el diseño del modal de buscar productos para
relacionar en revisión de precios, ahora los productos se ven muy enorme y
casi no se ven». El recuadro del proveedor ocupaba casi todo el alto y cada
resultado era una tarjeta alta: a 1366×768 no se veía ningún producto entero
(1 a 1440×900, 0 en teléfono). Ahora usa `ui/Modal`; el proveedor es un
resumen de dos o tres renglones fijo arriba con el buscador, y cada resultado
es una fila que se elige con un toque (6, 8 y 5 a la vista). Montos con
`colonesExacto`. Sin cambios en la búsqueda ni en lo que se guarda.

Dos pantallas: **Relacionar Productos** (`/relacionar-productos/:facturaId`,
línea por línea de una factura del buzón) y **Gestionar Relaciones**
(`/gestionar-relaciones`, los mapeos ya hechos). Las dos hablan con
`/productos-revision/*`.

## Qué se guarda, y dónde

La relación son dos cosas, y desde la migración 038 las dos apuntan al
producto PROPIO:

| | Tabla | Dice |
|---|---|---|
| la LÍNEA | `productos_factura_proveedor.producto_id` | qué producto es este renglón de esta factura |
| el MAPEO | `supplier_product_mapping.producto_id` | a qué producto corresponde ese código de ese proveedor, para las facturas que vengan |

La línea lleva el suyo porque no siempre coincide con el del mapeo: si el
mismo código se vuelve a relacionar con otro producto, el mapeo cambia para
todos pero las líneas viejas conservan el producto con el que se registraron
(70 de 8.478 en la copia local). Deducirlo del mapeo les reescribiría la
historia.

Todo lo escribe `relacionPropia.js`, por SQL: `producto_id` no está en el
esquema de Prisma ([[bloqueo/prisma-no-se-regenera]]).

## Vocabulario, porque "producto" quiere decir dos cosas

- `productoId` / `productoProveedorId` en las rutas de este módulo es la
  **línea** de la factura (`productos_factura_proveedor.id`, un uuid).
- `productoPropioId` es el producto del maestro (`producto.id`, un entero).

No se acepta un id de Alegra por ninguna puerta
([[leccion/ids-propios-y-de-alegra-no-se-mezclan]]): `crearRelacion` y
`editarRelacion` reciben `productoPropioId`, el buscador (`GET /buscar`)
devuelve el maestro propio —activos, tengan o no ficha en Alegra—, y las
rutas `/buscar-alegra` e `/info-alegra/:id` se quitaron.

## Lo que esto destrabó

Un producto creado en el sistema, **sin ficha en Alegra**, no se podía
relacionar con ninguna compra: relacionar exigía el id de Alegra, y el costo
de compras se validaba comparando ese id entre la línea y el historial. Ahora
`costoHistorico.js` escribe la fila con el `producto_id` de la línea y
`costoDerivado.js` la da por válida si la línea sigue relacionada con ESE
producto. Medido antes de cambiarlo: 7.886 filas válidas por el criterio
viejo y las mismas 7.886 por el nuevo.

## Los campos de Alegra que quedan

`alegra_item_id`, `alegra_reference` y `alegra_name` se siguen llenando
cuando el producto tiene ficha allá, porque Revisión de Precios y el buzón
todavía los leen. Salen siempre del producto propio, nunca al revés.

**En el mapeo, un producto sin ficha guarda `''` y no NULL** — ver
[[leccion/el-doble-de-prisma-no-valida-tipos]]. En la línea y en
`costo_historico` va NULL.

Nadie relaciona ya por el id de Alegra. El último era el buzón; confirmar y
rechazar desde Revisión de Precios se quitaron antes (nadie los llamaba).

## El buzón, al recibir una factura

`saveFactura` (`services/databaseService.js`, 2026-10-04) reusa lo que una
persona ya relacionó con ese proveedor, y lo hace por el producto propio:

- pide los mapeos de todos los códigos de la factura en UNA consulta, con su
  `producto_id` (`mapeosDelProveedor`); antes era una consulta por línea, con
  Prisma, que no conoce esa columna;
- la línea nace RELACIONADA con el producto de su mapeo
  (`productoDeLineasPorMapeo`, por SQL después de que Prisma crea la factura).
  El id de Alegra va solo de referencia y sale del producto propio;
- **un mapeo sin producto propio no relaciona nada.** Quedan 4, de productos
  que ya no existen: reusarlos dejaba la línea "relacionada" con nada y la
  factura pasaba a revisión con un renglón sin producto;
- el avance de la factura se cuenta con `recalcularAvance`, igual que en el
  resto.

Lo que se copiaba antes era el id de Alegra del mapeo: un producto creado en
el sistema se relacionaba a mano una vez y a la factura siguiente volvía a
quedar a medias.

Lo que NO cambió, a propósito: no se crea ningún mapeo por parecido de texto
—la primera vez decide una persona— y un código débil con otra descripción no
se reusa. Se quitó la búsqueda de "un parecido como pista" que el correo hacía
por cada línea pendiente: era una consulta a la caché de Alegra por línea,
solo para escribir un renglón en el log.

El correo está bloqueado en esta rama (`config/aislado.js`): esto se prueba
llamando a `saveFactura` con una factura ya leída, contra PostgreSQL.

## Crear un producto nuevo desde una línea

`productoDesdeLinea.js` (2026-10-04). Antes lo creaba EN ALEGRA, le subía la
foto allá, lo releía para copiarlo a `alegra_products_cache` y relacionaba por
el id de Alegra; en esta rama, donde a Alegra solo se le lee, el botón no
podía funcionar.

Ahora nace en `producto` por la misma puerta que "Nuevo producto" de
[[modulo/gestion-catalogo]] (`productos.service.crearProducto`): las mismas
reglas —CABYS de 13 dígitos, impuesto obligatorio, referencia única entre los
activos, medicamento con forma y registro— y la misma línea en la bitácora.
La foto va al almacenamiento propio; si falla, el producto y la relación
quedan y se avisa. No se escribe la caché de Alegra.

Lo que cambió para quien llena el formulario:

- **El impuesto se elige.** Viene propuesto el que calza con el IVA real de la
  línea (medio punto de tolerancia; con tres impuestos de 0 %, el que ya usan
  los productos). Si la línea trae una tarifa que no existe, no se adivina:
  hay que elegirlo. En Alegra ese caso creaba el producto sin impuesto.
- **La referencia vacía queda vacía.** Se rellenaba con el código del
  proveedor; como tiene que ser única, borrar el campo mandaba otra vez el
  mismo código y el producto no se podía crear.
- **No hay cantidad inicial.** Era el inventario inicial en Alegra y el
  propio todavía no existe ([[bloqueo/conteo-fisico]]).
- **Las unidades son las de Hacienda** (Unid, m, kg…), como las guarda el
  maestro.

`GET /productos-revision/:lineaId/formulario-producto` entrega las categorías
y los impuestos propios dentro de este módulo: quien relaciona compras no
tiene por qué tener permiso sobre Gestión de Catálogo.

**El precio sugerido no usaba el margen de la categoría.** El formulario le
mandaba al motor el id del desplegable y la configuración de márgenes está
llaveada por NOMBRE: nunca calzaba, y salía siempre el margen por defecto
(25 %) aunque Librería pida 29,2 % y Productos para perro 20 %. Se manda el
nombre. El mismo defecto está en `developer`/`main`.

`POST /productos-revision/ajustar` se quitó: escribía el precio en Alegra y
ninguna pantalla lo llamaba.

## El avance de la factura

Se vuelve a contar desde las líneas cada vez que una cambia:
[[decision/el-avance-de-la-factura-sale-de-sus-lineas]].

## Lo que falta

Nada de este módulo depende ya de Alegra. La búsqueda de fotos sugeridas,
que colgaba del prefijo adaptador, pasó a `/catalogos/imagenes-sugeridas` el
2026-10-04, al retirarse la Gestión de Catálogo vieja.


## Consulta compartida de proveedores — 2026-10-14

`getRelacionesDeProducto` conserva el contrato usado por Gestionar Relaciones,
pero vive en `productos/proveedoresProducto.service.js`, compartido con la nueva
pestaña de [[modulo/gestion-catalogo]]. SQL directo por id propio, sin Prisma:
costos de líneas RELACIONADAS que coincidan en producto/cédula/código, sin
regalías ni compras anuladas. Fotografía de compra cuando existe, moneda/fecha
explícitas para el catálogo. El servicio de este módulo baja de 831 a 700 líneas
y sale de la lista de deuda de estructura.
