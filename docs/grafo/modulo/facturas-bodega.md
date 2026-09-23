---
id: modulo/facturas-bodega
tipo: modulo
titulo: Facturas en Bodega — el despacho de cada pedido, sin hacer esperar a Alegra
estado: vigente
archivos:
  - backend/src/modules/warehouse/warehouse.service.js
  - backend/src/modules/warehouse/warehouse.controller.js
  - frontend/src/hooks/useFacturasBodega.js
  - frontend/src/pages/FacturasBodega.jsx
  - frontend/src/utils/facturasBodegaUtils.js
  - backend/tests/bodegaSincronizacion.test.js
  - backend/tests/bodegaUtils.test.js
aristas:
  relacionado: [modulo/permisos, decision/permisos-por-prefijo-mas-especifico, leccion/fecha-utc-costa-rica]
medido: 2026-09-23
---

Bodega alista cada factura de venta desde el teléfono: marca cada producto
como completo, faltó todo o parcial, y la factura pasa al historial (y, sin
faltantes, a la cola de impresión). Las facturas vienen de Alegra; el estado
de bodega, los faltantes y la hora de despacho (`facturas.bodega_procesado_en`)
son nuestros.

LA SINCRONIZACIÓN NO HACE ESPERAR AL TELÉFONO (2026-09-23). La caché del
servidor guarda SOLO lo de Alegra, por ventana de días; lo nuestro se lee de
la base en cada pedido. Con la caché vencida se contesta con lo guardado y se
actualiza por detrás (`metadata.actualizando`); dos pedidos a la vez comparten
una sola sincronización. Antes cada factura despachada invalidaba la caché y
la siguiente apertura sincronizaba todo con Alegra (60 s por página × 4
intentos en un mal momento): ese era el "timeout al sincronizar" del teléfono.

EL HISTORIAL VA EN ORDEN DE DESPACHO: la última despachada primero
(`ordenarHistorial`, por `despachada_en`); las anteriores al 25 de agosto,
sin hora, al final.

TRAMPAS QUE YA COSTARON
- Abrir una factura le pedía el detalle a Alegra y, al llegar, pisaba lo que
  el bodeguero ya había marcado. Ahora lo registrado sale de la base
  (`GET /bodega/facturas/:id/estados`) y los botones esperan quietos.
- Bodega registra también los productos COMPLETOS (tipo 'completo') para poder
  reabrir la factura igual: cualquier conteo de faltantes tiene que excluirlos
  (`tipo_faltante <> 'completo' AND cantidad_faltante > 0`), o se infla.
- Al reabrir una del historial, 'completo' tiene que volverse 'ninguno' en la
  pantalla; si no, guardar la modificación lo registraba como 'parcial' con 0
  (quedaron 10 filas así en 3 facturas).
- Las fechas 'YYYY-MM-DD' se leen como día local (`fechaLocal`): con
  `new Date()` la lista mostraba cada factura con un día menos.
- `/alegra/bodega` es del módulo (no compartida): antes cualquiera con sesión
  podía marcar facturas como despachadas.
