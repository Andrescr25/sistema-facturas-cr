---
id: decision/el-total-manda-sobre-las-lineas
tipo: decision
titulo: El total del comprobante manda, no la suma de las líneas
estado: vigente
archivos:
  - backend/migrations/independencia/020_cargar_compras_del_buzon.sql
aristas:
  bloqueado_por: [bloqueo/xml-historico-sin-recuperar]
  relacionado: [tabla/compra]
medido: 2026-09-19
---

De las 862 facturas del buzón, 18 tienen el total del encabezado distinto de
la suma de sus líneas: de ₡65 a ₡16.941,92, y algunas NEGATIVAS —las líneas
suman MÁS que la factura—. No es redondeo.

Son descuentos y cargos a nivel de comprobante (`TotalOtrosCargos`,
`TotalDescuentos`, posible `TotalIVADevuelto`) que el parser de XML no
extraía. `compra.total` se carga con el total del comprobante, no con la suma
de líneas, porque es lo que se le debe al proveedor: calcularlo sumando
líneas le pagaría de menos a unos y de más a otros.

Este nodo se marca `retirado` (no se borra) el día que
[[bloqueo/xml-historico-sin-recuperar]] se resuelva y las 18 se reconcilien de verdad
extrayendo esos campos del XML.
