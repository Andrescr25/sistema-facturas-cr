---
id: decision/el-buzon-no-es-la-compra
tipo: decision
titulo: El buzón y la compra son tablas distintas, a propósito
estado: vigente
archivos:
  - backend/migrations/independencia/019_compra_y_compra_linea.sql
aristas:
  relacionado: [tabla/compra, tabla/facturas-proveedores]
medido: 2026-09-19
---

`facturas_proveedores` + `productos_factura_proveedor` son el BUZÓN: lo que
llegó por correo, tal como llegó, aceptado o no. `compra` es el hecho de que
esa factura entró al negocio.

Por qué son tablas aparte y no columnas nuevas en el buzón: una factura
rechazada, duplicada, o que resultó ser un gasto recurrente sigue en el buzón
y nunca llega a ser compra. Si fueran la misma tabla, "rechazar" tendría que
significar borrar una fila que en realidad sí existió y sí hay que poder
consultar.

De las 862 del buzón, 860 se convirtieron en compra (855 `ENVIADA` + 5
`GASTO_RECURRENTE`); las 2 que nadie había aceptado (`PROCESADA`,
`RELACIONADA`) se quedaron en el buzón.
