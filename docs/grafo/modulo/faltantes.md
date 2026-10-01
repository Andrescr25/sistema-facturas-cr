---
id: modulo/faltantes
tipo: modulo
titulo: Faltantes — del despacho a la reimpresión, sobre la factura y el producto propios
estado: vigente
archivos:
  - backend/migrations/independencia/032_faltantes_con_ids_propios.sql
  - backend/src/utils/guardarFaltantes.js
  - backend/src/modules/reports/report.service.js
  - backend/src/modules/reports/notasDeFaltantes.js
  - backend/src/modules/reprinting/colaImpresion.js
  - backend/src/modules/missing-items/missing-items.service.js
  - backend/services/proveedorAsignacionService.js
  - backend/services/scheduledCleanup.js
  - frontend/src/hooks/useReporteClientes.js
  - frontend/src/hooks/useReporteProveedores.js
  - frontend/src/hooks/useImpresion.js
  - frontend/src/utils/reporteClientesUtils.js
  - frontend/src/utils/impresionUtils.js
  - frontend/src/services/colaImpresionService.js
  - backend/tests/faltantesIdsPropios.test.js
  - backend/tests/notasDeFaltantes.test.js
  - backend/tests/fechaCalendarioReportes.test.js
aristas:
  depende_de: [tabla/supplier-product-mapping]
  relacionado: [modulo/facturas-bodega, modulo/facturacion, leccion/ids-propios-y-de-alegra-no-se-mezclan, leccion/fecha-utc-costa-rica, leccion/proveedor-por-cedula]
medido: 2026-09-30
---

EL RECORRIDO. Bodega despacha una factura y marca lo que faltó → el Reporte
de Proveedores junta lo que hay que comprar, por proveedor → el Reporte de
Clientes registra qué llegó después y da la factura por lista → Impresión
ajusta la factura y la reimprime.

SOBRE LO PROPIO (2026-09-30, sección 11 del checklist, pasos 2 y 3). Cada
faltante cuelga de `factura.id` y de `producto.id`
(`faltantes.factura_propia_id`, `faltantes.producto_propio_id`), y la cola
de impresión de `factura.id` (`facturas_reimpresion.factura_propia_id`) —
migración 032. Antes colgaban de las tablas viejas `facturas` y `productos`,
que se llenaban desde Alegra: una factura hecha en el sistema no tenía cómo
tener faltantes.

LAS COLUMNAS VIEJAS SE RENOMBRARON, NO SE REUSARON: `factura_vieja_id`,
`producto_viejo_id`. Reusar `factura_id` para el id propio era la trampa de
siempre ([[leccion/ids-propios-y-de-alegra-no-se-mezclan]]): los dos son
seriales, y código traído de developer que escribiera ahí el id de la tabla
vieja colgaría el faltante de OTRA factura sin error. Con el nombre cambiado
falla en voz alta. Por la misma razón se borró `POST /alegra/facturas/:id/faltantes`
(registraba por id de Alegra y le pasaba el id viejo a la función que ahora
espera el propio) y el módulo `faltantes` (`/api/faltantes` de alta y
consulta), que nadie llamaba.

EL PRODUCTO DE UN FALTANTE (`guardarFaltantes` → `productoPropioDe`): el
`producto_id` que manda Bodega; si no viene, el id de Alegra (único en
`producto`); y por referencia solo si calza con UN producto — hay 4
referencias repetidas en el maestro.

LAS NOTAS ("lo que pidió el cliente", en el Reporte de Proveedores) salen de
`factura_linea.descripcion` de la misma línea del faltante, con una consulta.
Antes se recorría la lista de facturas de Alegra (~5 s por página). Una línea
sin nota trae la descripción del producto (Facturación la pone): esa no cuenta.
Van indexadas por `producto_id`, el mismo de cada línea del reporte.

EL PROVEEDOR del faltante se asigna solo con el mapeo, buscado por el
`producto_id` propio (los mapeos lo llevan desde la 018) y, para los viejos,
por id de Alegra o referencia.

DAR POR LISTA (Reporte de Clientes → Impresión,
`POST /reportes/faltantes/cliente/facturas/:facturaId/impresion`): los
ajustes se arman en el servidor con lo que la pantalla fue guardando
producto por producto (`faltantes_ajustes`), no con lo que mande la
pantalla; un faltante sin respuesta se rebaja entero. La cola reusa la fila
de la factura: hay una por factura.

RECUPERAR desde el Reporte de Clientes (`.../recuperar`): si todavía no se
imprimió, la factura SALE de la cola; si ya se procesó, sus faltantes vuelven
a pendientes y la fila queda como historial de Impresión. Con el camino
viejo, recuperar una factura en cola no tocaba el servidor: al recargar
volvía bloqueada "en impresión", e Impresión la habría procesado con los
ajustes de antes.

PROCESADA es lo que Impresión ya reimprimió: al procesarla sus faltantes
pasan a 'procesado' (y al recuperarla vuelven); el reporte lo lee de ahí.
"En impresión" es la fila pendiente de la cola. Una factura anulada sale de
los dos reportes y de las notas (`factura.estado <> 'anulada'`; la columna es
NOT NULL, así que `<>` no pierde filas).

LAS FECHAS de la factura propia son de calendario y viajan como 'YYYY-MM-DD'.
`new Date('2026-09-10')` es medianoche UTC, el 9 en Costa Rica: los
formateadores de Reporte de Clientes e Impresión las leen como día local
(pasó en la primera vuelta en el navegador).

LA LIMPIEZA SEMANAL (domingo 23:59 y el botón de Configuración) borra los
faltantes y sus ajustes, limpia el encargo que Bodega anotó en la factura
(`factura.bodega_observaciones`) y reinicia el ciclo de pedidos. Ya no vacía
`facturas_pendientes`: nadie escribe en ella. NUNCA se ejecuta para probar —
ni contra la base local: su SQL se verifica con PREPARE.

FALTA (pasos que siguen en la sección 11): Impresión todavía edita, procesa
y abre el PDF por el id de Alegra (camino viejo de `invoice.service`,
adaptado a las columnas nuevas). Después se retira el puente
`facturas.factura_propia_id`.
