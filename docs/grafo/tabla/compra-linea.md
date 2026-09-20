---
id: tabla/compra-linea
tipo: tabla
titulo: La cantidad se guarda dos veces, a propósito
estado: vigente
archivos:
  - backend/migrations/independencia/019_compra_y_compra_linea.sql
aristas:
  vive_en: [modulo/compras]
  relacionado: [modulo/inventario]
medido: 2026-09-19
---

`cantidad` es en la unidad del proveedor (la caja de 100 bandejas);
`cantidad_propia` es una columna GENERADA (`cantidad * factor_conversion`) en
la mía (2 paquetes, con factor 0,02). El inventario, cuando exista
([[modulo/inventario]]), se mueve en la propia; cotejar contra el papel se
hace con la del proveedor. Que sea generada evita que las dos puedan
separarse.

El costo por unidad propia NO se guarda acá: se calcula con descuento,
impuesto y factor en `modules/precios/costo.js`. Guardarlo aparte hubiera sido
la misma clase de error que ya costó un margen falso una vez (ver
[[leccion/precio-sin-iva-costo-con-iva]] si existe, o la memoria de
`~/.claude` del mismo nombre).

`producto_id` puede ser NULL: 123 de 8.590 líneas no tienen mapeo. No se
descartan — si se cayeran, el detalle dejaría de sumar lo que dice la
factura.
