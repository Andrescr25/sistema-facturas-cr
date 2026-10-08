---
id: modulo/impresion
tipo: modulo
titulo: Impresión — la factura lleva lo que se entrega y el precio revisado
estado: vigente
archivos:
  - backend/src/modules/invoices/invoice.service.js
  - backend/src/modules/invoices/ajustesImpresion.js
  - backend/src/modules/invoices/invoice.controller.js
  - backend/src/modules/reports/report.service.js
  - frontend/src/hooks/useImpresion.js
  - frontend/src/hooks/useReporteClientes.js
  - frontend/src/utils/impresionUtils.js
  - frontend/src/services/alegraService.js
  - frontend/src/components/impresion/FormularioEdicionFactura.jsx
  - backend/tests/impresionModificacion.test.js
  - backend/tests/impresionPedidoExacto.test.js
  - backend/tests/impresionLocal.test.js
  - backend/tests/impresionHook.test.js
aristas:
  relacionado: [modulo/facturas-bodega, modulo/revision-precios, leccion/el-impuesto-es-de-cada-linea, leccion/la-db-local-es-produccion]
medido: 2026-10-08
---

Reporte Clientes envía los faltantes revisados a la cola. Todavía no modifica
Alegra ni termina la factura: esa modificación ocurre al guardar en Impresión.
El vínculo usa el id del producto de Alegra o su referencia normalizada y,
si falta la referencia, el mapeo local por id. No se compara un código con
un id ni se elige otro producto porque tenga el mismo nombre.

La cantidad final es la original menos lo que sigue faltando. Si el pedido
tenía 10 unidades, faltaban 3 y llegó 1, se facturan 8. Si no llegó ninguna
de esas 3, se conservan las 7 que bodega tenía. Solo se quita la línea cuando
su cantidad final es cero. Una factura sin ningún producto se bloquea para
revisar el pedido; no se imprime ni se vuelve a la lista original.

La cola conserva la cantidad y la línea originales dentro de cada ajuste
JSONB, sin columnas nuevas. Así recuperar, repetir o perder la respuesta de
Alegra no vuelve a rebajar el faltante. Si luego llega todo, una línea quitada
puede restaurarse. Las cantidades corregidas manualmente se conservan al
recuperar; una nueva respuesta de entrega vuelve a calcularlas. Los registros
anteriores sin copia original se capturan al procesar: no se reconstruyen
modificaciones históricas que ocurrieron antes de esta corrección.

Al finalizar se consulta el precio actual para cada línea sin precio manual,
incluso si no hay faltantes. La pantalla manda `precio_editado` para distinguir
un precio escrito por una persona del precio que mostró automáticamente.
Los clientes anteriores conservan la comparación contra el precio emitido.
Descuentos e impuestos de cada línea llegan a Alegra y al total de la edición.
El paso directo de Bodega (`sin_pendientes`, actualizar precios apagado)
conserva su comportamiento.

Si no se puede verificar un precio o Alegra rechaza la modificación, la cola
queda pendiente y la factura no llega a Historial. Un bloqueo de PostgreSQL
por factura dentro de la transacción serializa los clics simultáneos; la finalización de los estados
locales y el historial se guarda en una transacción. La copia original se
confirma antes del cambio externo para permitir un reintento seguro.
La finalización vuelve a tomar el bloqueo y comprueba si otro clic ya terminó.
Son bloqueos de transacción (`pg_advisory_xact_lock`), compatibles con el
pooler de Supabase; no se depende de conservar una sesión entre transacciones.
Recuperar comparte el bloqueo y devuelve los estados a pendiente en una sola
transacción. Al abrir otra factura se descartan respuestas atrasadas de la
anterior, para que sus productos no pisen los del pedido abierto.

VERIFICACIÓN LOCAL. `impresionLocal.test.js` exige explícitamente
`IMPRESION_TEST_DATABASE_URL`, con host de loopback y nombre de base `zz_*`.
Cada caso crea y elimina su propio esquema `zz_impresion_*`, usa PostgreSQL
real y reemplaza la integración con Alegra. Prueba Reporte Clientes,
payload del frontend, controlador, cola, cambios, errores, recuperación y
doble clic. No arranca el servidor, cron, correo ni WhatsApp; no ejecuta
`setupDatabase.js`, solo lee los CREATE de las tablas necesarias. Las
pruebas no verifican el PDF ni una impresora real de Alegra.
