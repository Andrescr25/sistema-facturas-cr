---
id: tabla/venta-historico
tipo: tabla
titulo: El historial de ventas — una línea por producto y factura, de donde sale la rotación
estado: vigente
archivos:
  - backend/migrations/add_venta_historico.sql
  - backend/src/modules/catalogo-agente/catalogo-agente.service.js
  - backend/src/modules/facturacion/facturacion.service.js
  - backend/server.js
  - backend/tests/ventaHistoricoReconciliacion.test.js
  - backend/tests/rotacionVentas.test.js
aristas:
  relacionado: [modulo/rentabilidad, modulo/catalogo-agente, leccion/un-borrador-no-es-una-venta, leccion/fecha-utc-costa-rica]
medido: 2026-09-25
---

`venta_historico (alegra_invoice_id, alegra_item_id, cliente_id,
cliente_nombre, cantidad, precio_unitario, fecha_emision)`, única por
`(factura, producto)`. `precio_unitario` es SIN IVA y sin descontar
descuentos (pesan 0,003 %, medido). Si un producto sale en dos líneas de la
misma factura, se suman ANTES de insertar: sumar en el `ON CONFLICT`
duplicaría el total cada vez que se relee la factura.

Separada a propósito de `venta_items` (ventana móvil de 120 días de los
excesos).

CÓMO SE LLENA — tres caminos, del más rápido al más completo:

1. **Al crear la factura** (`registrarFacturaEnHistorico`, llamado por
   `facturacion.service` con la respuesta de Alegra). Nunca tira error: la
   factura ya existe; si falla, la trae el paso 2.
2. **Cada hora**, `sincronizarHistorialCompras()` incremental: desde 2 días
   antes de la última fecha guardada hasta hoy en Costa Rica. Trae también
   las facturas hechas directo en Alegra.
3. **Una vez al día**, la misma con `desde` = hace 60 días: una factura vieja
   que se anula HOY conserva su fecha vieja y la corrida incremental no la
   vuelve a mirar.

Cada factura releída se RECONCILIA: lo que ya no está en ella se borra
(`eliminarLineasObsoletas`), y un borrador o una anulada entra sin líneas, o
sea, se borra entera — ver [[leccion/un-borrador-no-es-una-venta]].

QUIÉN LA LEE: la rotación y las estadísticas de [[modulo/rentabilidad]]
(`ventas/`), "lo que suele comprar" de cada cliente en el catálogo del agente,
Cliente nuevo, Gestión de Catálogo y el motor de precios.
