---
id: tabla/compra
tipo: tabla
titulo: La compra es nuestra, el buzón es otra cosa
estado: vigente
archivos:
  - backend/migrations/independencia/019_compra_y_compra_linea.sql
  - backend/migrations/independencia/020_cargar_compras_del_buzon.sql
aristas:
  vive_en: [modulo/compras]
  reemplaza: [tabla/facturas-proveedores]
  bloqueado_por: [decision/el-total-manda-sobre-las-lineas]
  relacionado: [tabla/compra-linea, tabla/cuentas-por-pagar]
medido: 2026-09-19
---

Ver [[decision/el-buzon-no-es-la-compra]] para el porqué de separarla de
`facturas_proveedores`.

Cuelga de `proveedor_id` propio (100 % de las 860 lo encuentran por cédula) y
guarda `factura_proveedor_id` como puente hacia el buzón, con índice único
parcial para que reprocesar el correo no duplique.

860 compras cargadas al 2026-09-19: las 855 en estado `ENVIADA` del buzón más
5 `GASTO_RECURRENTE`. Las 2 que nadie había aceptado (`PROCESADA`,
`RELACIONADA`) se quedaron en el buzón, que es donde deben estar.
