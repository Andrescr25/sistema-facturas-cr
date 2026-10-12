# Facturas anuladas fuera de Bodega

Solicitud del usuario: una factura anulada en Facturación continuaba como
pendiente en Facturas en Bodega. Corrección de Codex, 2026-10-12.

La anulación directa ya se filtraba con `estado = 'emitida'`. El caso que
faltaba era la nota de crédito completa: Facturación la muestra como anulada,
pero conserva ese estado interno. Bodega ignoraba sus créditos. Además,
retomaba una factura y su borrador desde el teléfono sin comprobar su vigencia.

La lista aplica el cálculo compartido de créditos vigentes antes del límite,
con la misma tolerancia de medio colón de Facturación. Excluye crédito total;
conserva pendientes con crédito parcial o cobro completo. Anular la nota vuelve
a habilitar la factura si ya no está acreditada por completo. Los registros
de factura, alistado, faltantes y movimientos se conservan; no se altera saldo
ni se intenta modificar un comprobante fiscal.

Abrir una pendiente también consulta el servidor. Al volver a la pestaña se
refresca la lista o se valida el despacho abierto sin cambiar su borrador.
Una anulación confirmada cierra el despacho con el motivo y quita la factura
de la lista y caché. Conserva lo marcado. Respuestas atrasadas de otra apertura
se descartan; un error de red conserva el trabajo. El estado de apertura vive
en `useFacturaBodegaAbierta`, separado del listado; ambos cumplen el límite
de 500 líneas.

Registrar faltantes y despachar/reabrir bloquean primero la factura y después
leen sus créditos vigentes, en la transacción de la escritura. Crear una nota
ya toma ese mismo bloqueo. Así, un despacho que esperaba una nota recién
confirmada ve su crédito y rechaza 409 antes de escribir o encolar. El código
de respuesta específico permite a la pantalla distinguir esta situación de
otros conflictos recuperables.

Verificación realizada:

- Suite completa: 2.664 casos, 2.336 aprobados, 328 condicionales omitidos,
  cero fallos, contra una copia PostgreSQL local con salidas bloqueadas.
- Pruebas de Bodega y ciclos con `PROBAR_BASE_LOCAL=1`: 21 aprobadas,
  incluyendo anulación por el servicio real, notas completas/parciales,
  varias notas, reversión de nota, pago, tolerancia, resumen y dos conexiones
  que prueban la espera del bloqueo. Las pruebas unitarias de Bodega y el
  analizador SQL de PostgreSQL también pasan.
- Seis pruebas de los manejadores reales de los hooks con respuestas
  controladas: caché, borrador, bloqueo durante validación, respuestas antiguas,
  rechazo al guardar y desconexión.
- Build de Vite correcto. Chromium a 390 × 844 y 1280 × 900: apertura
  cacheada anulada, exclusión de nota completa, nota parcial visible,
  anulación con ficha abierta y foco de pestaña, borrador conservado y
  despacho real de una factura vigente con entrada en impresión. Cero
  errores JavaScript. Autenticación simulada; consultas y escrituras pasan
  por el controlador real y PostgreSQL dentro de BEGIN/ROLLBACK.

Trabajo en una carpeta propia sobre `developer`. Base desechable clonada de
la vista local; datos ZZ con rollback o retirada específica. Sin pruebas en
producción, sin mensajes reales ni limpieza semanal. No necesita migración.
