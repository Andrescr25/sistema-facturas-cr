---
id: tabla/compra-linea
tipo: tabla
titulo: La cantidad se guarda dos veces, a propósito
estado: vigente
archivos:
  - backend/migrations/independencia/049_recepcion_orden_compra_ciclo.sql
  - backend/migrations/independencia/019_compra_y_compra_linea.sql
aristas:
  vive_en: [modulo/compras]
  relacionado: [modulo/recepcion-ordenes-compra, modulo/inventario]
medido: 2026-10-06
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

RECEPCIÓN049. [[modulo/recepcion-ordenes-compra]] separa aceptación comercial de
entrada física SOLO en compras nuevas ya vinculadas al INSERT. Modalidad fija
inventario_por_recepcion=true, cantidades propias de eventos, origen compra/id y
delta incremental en misma transacción. Costo de las partidas del evento físico actual, sin revalorar lo previo ni
restar valores ya redondeados (regalía posterior conserva costo cero). Compras anteriores mantienen entrada comercial,
sin nueva acreditación ni importación de stock histórico. Línea ya recibida
inmutable por SQL; no corregirla editando su cantidad/factor/producto. Las frases
sobre entrada íntegra al registrar describen compras false y la etapa042.
