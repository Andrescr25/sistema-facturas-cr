---
id: modulo/relacionar-productos
tipo: modulo
titulo: Relacionar Productos — la línea del proveedor se cuelga de `producto.id`
estado: vigente
archivos:
  - backend/src/modules/productos-revision/relacionPropia.js
  - backend/src/modules/productos-revision/productoDesdeLinea.js
  - backend/src/modules/productos-revision/productos-revision.service.js
  - backend/src/modules/productos-revision/productos-revision.controller.js
  - backend/src/modules/productos-revision/productos-revision.routes.js
  - backend/src/modules/productos-revision/idsPropiosDelMapeo.js
  - backend/src/modules/precios/costoHistorico.js
  - backend/src/modules/precios/costoDerivado.js
  - backend/migrations/independencia/038_relacion_de_compra_por_producto_propio.sql
  - backend/migrations/independencia/039_avance_de_la_factura_desde_sus_lineas.sql
  - backend/tests/relacionPropia.test.js
  - backend/tests/productoDesdeLinea.test.js
  - backend/tests/dobles/buzonEnTransaccion.js
  - backend/tests/buscarRelaciones.test.js
  - backend/tests/costoDerivadoPropio.test.js
  - frontend/src/hooks/useRelacionarProductos.js
  - frontend/src/hooks/useGestionarRelaciones.js
  - frontend/src/components/relacionar-productos/ModalCrearProducto.jsx
aristas:
  depende_de: [tabla/supplier-product-mapping, tabla/facturas-proveedores]
  bloqueado_por: [bloqueo/prisma-no-se-regenera, bloqueo/conteo-fisico]
  relacionado: [modulo/revision-precios, modulo/compras, modulo/rentabilidad, modulo/gestion-catalogo, decision/el-avance-de-la-factura-sale-de-sus-lineas, leccion/ids-propios-y-de-alegra-no-se-mezclan, leccion/el-doble-de-prisma-no-valida-tipos, leccion/proveedor-por-cedula]
medido: 2026-10-04
---

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

El buzón, al recibir una factura, todavía relaciona con el mapeo ya hecho y
copia su id de Alegra a la línea; después llama a `ligarProductoDeLineas`,
que la deja con su producto propio. Era el último que quedaba: confirmar y
rechazar desde Revisión de Precios se quitaron (nadie los llamaba).

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

- **El buzón** (`services/databaseService.js`) relaciona solo con el mapeo y
  copia su id de Alegra a la línea.
- La búsqueda de fotos sugeridas sigue colgada del prefijo adaptador
  (`/alegra/catalog/search-images`); no le habla a Alegra, pero el nombre se
  va con el retiro de ese prefijo.
