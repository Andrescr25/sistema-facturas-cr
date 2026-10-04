---
id: modulo/relacionar-productos
tipo: modulo
titulo: Relacionar Productos — la línea del proveedor se cuelga de `producto.id`
estado: vigente
archivos:
  - backend/src/modules/productos-revision/relacionPropia.js
  - backend/src/modules/productos-revision/productos-revision.service.js
  - backend/src/modules/productos-revision/productos-revision.controller.js
  - backend/src/modules/productos-revision/productos-revision.routes.js
  - backend/src/modules/productos-revision/idsPropiosDelMapeo.js
  - backend/src/modules/precios/costoHistorico.js
  - backend/src/modules/precios/costoDerivado.js
  - backend/migrations/independencia/038_relacion_de_compra_por_producto_propio.sql
  - backend/tests/relacionPropia.test.js
  - backend/tests/buscarRelaciones.test.js
  - backend/tests/costoDerivadoPropio.test.js
  - frontend/src/hooks/useRelacionarProductos.js
  - frontend/src/hooks/useGestionarRelaciones.js
aristas:
  depende_de: [tabla/supplier-product-mapping, tabla/facturas-proveedores]
  bloqueado_por: [bloqueo/prisma-no-se-regenera]
  relacionado: [modulo/revision-precios, modulo/compras, modulo/rentabilidad, leccion/ids-propios-y-de-alegra-no-se-mezclan, leccion/el-doble-de-prisma-no-valida-tipos, leccion/proveedor-por-cedula]
medido: 2026-10-03
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

Lo que todavía relaciona por el id de Alegra (confirmar en Revisión de
Precios, crear producto desde una línea) o por un mapeo ya hecho (el buzón al
recibir una factura) llama después a `ligarProductoDeLineas`, que deja la
línea con su producto propio. Se va cuando esos tres migren.

## Lo que falta

- **Crear un producto nuevo desde una línea** (`crearProducto`) todavía lo
  crea en Alegra; el botón lo dice. `ajustarProducto` todavía puede escribir
  el precio en Alegra.
- **Revisión de Precios** confirma y rechaza por el id de Alegra.
- **El buzón** (`services/databaseService.js`) relaciona solo con el mapeo y
  copia su id de Alegra a la línea.
- Soltar una relación no recalcula `facturas_proveedores.porcentaje_relacionado`
  ni devuelve la factura de RELACIONADO a pendiente: ya era así antes, y qué
  estado le toca a una factura que deja de estar completa no está decidido.
