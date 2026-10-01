---
id: modulo/facturacion
tipo: modulo
titulo: Facturación de venta — ya cerrado en la migración
estado: vigente
archivos:
  - backend/src/modules/facturacion/facturacion.service.js
  - backend/src/modules/facturacion/facturaPropia.service.js
aristas:
  relacionado: [modulo/compras, modulo/faltantes]
medido: 2026-09-30
---

Ventas ya vive sobre la base propia (sección 6 del checklist, 13 de 15). Se
enlaza acá porque el checklist tuvo, durante meses, siete ítems de esta
sección archivados por error dentro de "## 2. Productos" (líneas 130-177):
"Ver las facturas ya emitidas", "Cómo paga el cliente", "Emitir
electrónicamente una factura ya creada" y otros cuatro, más 37 hallazgos de
Cobros mezclados en el mismo bloque. Se corrigió el 2026-09-20 moviéndolos a
sus secciones (6 y 7) y recontando.

Queda pendiente, y depende de Hacienda, no de código: emitir electrónicamente
una factura ya creada. El botón existe y está apagado a propósito.

EDITAR UNA FACTURA EMITIDA (`editarFactura`; dentro de una transacción
ajena, `editarFacturaEn`, que es lo que usa Impresión): no se puede si es
electrónica, si tiene cobros o una nota de crédito. Un producto desactivado
DESPUÉS de facturarlo se conserva al editar esa factura (había 8 facturas así
en el último mes y Impresión no las habría podido ajustar); lo que no se
puede es agregarlo nuevo.
