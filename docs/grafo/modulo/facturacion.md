---
id: modulo/facturacion
tipo: modulo
titulo: Facturación de venta — ya cerrado en la migración
estado: vigente
archivos:
  - backend/src/modules/facturacion/facturacion.routes.js
  - backend/src/modules/facturacion/facturaPropia.controller.js
  - backend/src/modules/facturacion/facturaPropia.service.js
  - backend/src/modules/facturacion/idempotencia.js
  - backend/src/modules/facturacion/facturaConsulta.service.js
  - backend/src/modules/facturacion/saldo.sql.js
  - frontend/src/services/facturacionService.js
  - frontend/src/utils/facturacionUtils.js
  - backend/tests/facturacionSinAlegra.test.js
  - backend/tests/sugerenciasFacturacion.test.js
  - backend/tests/idempotenciaFactura.test.js
aristas:
  relacionado: [leccion/ids-propios-y-de-alegra-no-se-mezclan, modulo/compras, modulo/faltantes, modulo/portal-clientes, modulo/conciliacion-ventas, modulo/conciliacion-cobros, modulo/conciliacion-notas-credito, modulo/historico-debitos-ingreso]
medido: 2026-10-04
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

SALDO PARA CONSULTA Y CONCILIACIÓN (2026-10-03): las expresiones `COBRADO` y
`ACREDITADO` viven en `saldo.sql.js`, un archivo puro que no carga la base ni
servicios. `facturaConsulta.service` las usa y conserva sus exportaciones
para Cobros y el Portal. La conciliación las importa directamente: así mide
la misma fórmula de la pantalla sin arrancar la aplicación. Excluye cobros
anulados y notas anuladas; el saldo de consulta se limita a cero como antes.
Las columnas históricas `saldo` y `total_pagado` no determinan lo que se debe.

DÉBITO HISTÓRICO (2026-10-04): [[modulo/historico-debitos-ingreso]] conserva
el documento de Alegra y su crédito en tablas propias separadas. No lo
convierte en factura, deuda nueva o venta, ni cambia `ACREDITADO` de las
facturas. Su emisión propia sigue fuera del alcance.

FACTURAR UN PEDIDO (sección 12, parte 2): el portal usa
`crearFacturaEnTransaccion` con la opción interna `preciosConImpuesto`.
Se separan base e impuesto del total final de cada línea, para conservar
exactamente el precio prometido, sin volver a aplicar la rebaja. El precio
unitario guardado sigue siendo sin IVA. La pantalla de Facturación y las
cotizaciones usan las bases sin IVA habituales; una petición HTTP no activa
esta opción interna. Factura y pedido se confirman juntos, con bloqueo del
pedido para que repetir la solicitud devuelva la misma factura.

EDITAR UNA FACTURA EMITIDA (`editarFactura`; dentro de una transacción
ajena, `editarFacturaEn`, que es lo que usa Impresión): no se puede si es
electrónica, si tiene cobros o una nota de crédito. Un producto desactivado
DESPUÉS de facturarlo se conserva al editar esa factura (había 8 facturas así
en el último mes y Impresión no las habría podido ajustar); lo que no se
puede es agregarlo nuevo.

UN SOLO CAMINO (2026-10-04). Hasta ese día convivían la factura propia
(`/api/facturacion/facturas`) y la de siempre contra Alegra, que ya no usaba
ninguna pantalla pero seguía montada: `POST /api/facturacion/invoices` creaba
una factura EN ALEGRA y `PUT /api/alegra/facturas/:id` editaba una allá. Se
retiraron con `facturacion.service.js`, `facturacion.controller.js`,
`integrations/alegra/ventaSinStock.js` y el módulo viejo `invoices`
(`/api/facturas`, `/api/alegra/facturas`). `idempotencia.js` se queda: es de
la factura propia, y su prueba se reescribió sobre ella. La diferencia que
importa: un fallo al guardar queda `fallida` —la transacción es nuestra, no
quedó nada y reintentar es seguro—; `incierta` era "Alegra no contestó" y el
camino propio ya no la produce, pero el módulo sigue frenando las que haya en
la tabla.

LA TABLET Y LA MARCA `esPropia`. La base de Facturación en el navegador
(`SistemaFacturasCR`: facturas en copia, facturas y ediciones pendientes) NO se
borró al dejar Alegra — a diferencia de la del catálogo del agente. Puede tener
documentos de antes, con el id de allá. Mientras hubo dos rutas, la marca
elegía a cuál mandar; ahora que hay una, lo que no la trae NO SE MANDA
(`editarFactura` lo rechaza antes de tocar la red; una edición pendiente sin
marca queda con su motivo y el botón de descartar, no se borra sola). La copia
que queda al editar sin señal conserva la marca: sin eso, la segunda edición
sin señal de la misma factura se habría ido a la ruta de Alegra con un id
nuestro. Cuando el servidor RECHAZA una edición (409: tiene cobros, es
electrónica, está anulada) se muestra el motivo; antes se guardaba "para
después" y se reintentaba para siempre.

"SUELE FALTAR" (`GET /api/facturacion/clientes/:clienteId/sugerencias`). Es el
mismo cálculo del portal (`portal-clientes.inicio.service.obtenerInicio`),
con `cliente.id` en la ruta y `producto.id` en la respuesta. Del 2026-10-03
al 2026-10-04 la pantalla lo pidió con el id de Alegra: 216 de 247 clientes
veían las compras de otro. Ver
[[leccion/ids-propios-y-de-alegra-no-se-mezclan]], caso 5.

PENDIENTE: `emitirCon` todavía acepta ids de Alegra (`client`, línea sin
`productoId`) y `huellaDe` no incluye al cliente en el contrato propio. Está
en el checklist, sección 6.
