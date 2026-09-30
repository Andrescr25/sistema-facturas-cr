---
id: modulo/facturas-bodega
tipo: modulo
titulo: Facturas en Bodega — el despacho de cada pedido, sobre la factura propia
estado: vigente
archivos:
  - backend/src/modules/warehouse/warehouse.service.js
  - backend/src/modules/warehouse/warehouse.controller.js
  - frontend/src/hooks/useFacturasBodega.js
  - frontend/src/pages/FacturasBodega.jsx
  - frontend/src/utils/facturasBodegaUtils.js
  - backend/tests/bodegaSincronizacion.test.js
  - backend/tests/bodegaUtils.test.js
  - backend/src/modules/warehouse/bodegaPropia.js
  - backend/src/utils/guardarFaltantes.js
  - backend/migrations/independencia/031_bodega_en_factura.sql
  - frontend/src/services/bodegaPropiaService.js
  - backend/tests/bodegaPropia.test.js
aristas:
  relacionado: [modulo/permisos, decision/permisos-por-prefijo-mas-especifico, leccion/fecha-utc-costa-rica, modulo/facturacion, leccion/ids-propios-y-de-alegra-no-se-mezclan]
medido: 2026-09-29
---

EN ESTA RAMA, SOBRE LA FACTURA PROPIA (2026-09-29, sección 11, paso 1). La
pantalla lista las facturas EMITIDAS de `factura` con sus líneas
(`bodegaPropia.js`, `GET /alegra/bodega/facturas-propias`), con `factura_id`
como identidad; el estado de alistado vive en `factura` (migración 031). Las
rutas por `alegraId` siguen vivas pero la pantalla de la rama no las usa. Lo
guardado en el teléfono va bajo claves nuevas (`facturasBodegaPropia:*`):
con las viejas, un borrador de la factura 12 de Alegra se habría aplicado a
la factura propia 12.

EL PUENTE CON LA TABLA VIEJA: Faltantes, el Reporte de Proveedores, la cola
de impresión y el portal todavía leen `facturas`. Cada factura propia se
enlaza a su fila por `facturas.factura_propia_id` (`filaVieja`: por id de
Alegra si vino de allá, por número si es la misma; un número de otra factura
de Alegra da 409). Despachar escribe en las dos en una transacción, con la
misma hora copiada en SQL, y los faltantes se guardan con la misma función
que el camino de Alegra (`utils/guardarFaltantes.js`). Se retira en los pasos
2 y 3.

EL CERO EN UNA COLUMNA ÚNICA: la copia de cada factura propia entraba con
`facturas.alegra_id = 0`, y esa columna es única: la SEGUNDA factura propia
chocaba con la primera y no se podía facturar. No saltó porque la copia local
no tenía facturas propias. Ahora entra con NULL (031 suelta el NOT NULL).

Lo que sigue es cómo funciona en `main`, donde las facturas son de Alegra:

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
  (`tipo_faltante <> 'completo' AND cantidad_faltante > 0`), o se infla. Esta
  pantalla ya no cuenta faltantes (decisión del usuario, 2026-09-23: se
  siguen en su propio módulo); solo Por preparar e Historial.
- Al reabrir una del historial, 'completo' tiene que volverse 'ninguno' en la
  pantalla; si no, guardar la modificación lo registraba como 'parcial' con 0.
  Quedaron 10 filas así en 3 facturas (14910, 14915, 14919): corregidas en
  producción el 2026-09-23, con autorización y copia previa.
- Las fechas 'YYYY-MM-DD' se leen como día local (`fechaLocal`): con
  `new Date()` la lista mostraba cada factura con un día menos.
- `/alegra/bodega` es del módulo (no compartida): antes cualquiera con sesión
  podía marcar facturas como despachadas.
