---
id: tabla/compra
tipo: tabla
titulo: La compra es nuestra, el buzón es otra cosa
estado: vigente
archivos:
  - backend/migrations/independencia/049_recepcion_orden_compra_ciclo.sql
  - backend/migrations/independencia/019_compra_y_compra_linea.sql
  - backend/migrations/independencia/020_cargar_compras_del_buzon.sql
  - backend/migrations/independencia/024_quitar_estado_devuelta_de_compra.sql
aristas:
  vive_en: [modulo/compras]
  reemplaza: [tabla/facturas-proveedores]
  bloqueado_por: [decision/el-total-manda-sobre-las-lineas]
  relacionado: [modulo/recepcion-ordenes-compra, tabla/compra-linea, tabla/cuentas-por-pagar]
medido: 2026-10-06
---

Ver [[decision/el-buzon-no-es-la-compra]] para el porqué de separarla de
`facturas_proveedores`.

Cuelga de `proveedor_id` propio (100 % de las 860 lo encuentran por cédula) y
guarda `factura_proveedor_id` como puente hacia el buzón, con índice único
parcial para que reprocesar el correo no duplique.

860 compras cargadas al 2026-09-19: las 855 en estado `ENVIADA` del buzón más
5 `GASTO_RECURRENTE`. Las 2 que nadie había aceptado (`PROCESADA`,
`RELACIONADA`) se quedaron en el buzón, que es donde deben estar.

`estado` solo admite `registrada`/`anulada` (migración 024, aplicada a la
copia local el 2026-09-23). Traía un tercer valor, `devuelta` ("se le devolvió la mercadería al proveedor"), que salió de
una alucinación de una sesión anterior: nunca fue un pedido real, ninguna de
las 860 lo usaba y nada del código lo leía. Lo que el usuario sí pidió, y ya
existe, es otra cosa —devolver una factura mal relacionada a `PROCESADA` para
corregirla—, que vive en `factura.estado`, no acá.

RECEPCIÓN049. [[modulo/recepcion-ordenes-compra]] separa aceptación comercial de
entrada física SOLO en compras nuevas ya vinculadas al INSERT. Modalidad fija
inventario_por_recepcion=true, cantidades propias de eventos, origen compra/id y
delta incremental en misma transacción. Costo de las partidas del evento físico actual, sin revalorar lo previo ni
restar valores ya redondeados (regalía posterior conserva costo cero). Compras anteriores mantienen entrada comercial,
sin nueva acreditación ni importación de stock histórico. Línea ya recibida
inmutable por SQL; no corregirla editando su cantidad/factor/producto. Las frases
sobre entrada íntegra al registrar describen compras false y la etapa042.
