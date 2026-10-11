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
  - backend/tests/intentoDeFacturaIdPropio.test.js
  - backend/tests/facturaCobroRevertido.test.js
  - backend/tests/facturacionFlujoPantalla.test.js
  - backend/src/modules/facturacion/factura.pdf.js
  - frontend/src/components/facturacion/VistaFactura.jsx
  - frontend/src/components/facturacion/SelectorPago.jsx
  - frontend/src/components/facturacion/PanelCobro.jsx
  - backend/migrations/independencia/041_intento_de_factura_con_id_propio.sql
aristas:
  relacionado: [modulo/hacienda, leccion/lo-que-mueve-plata-no-va-por-omision, leccion/ids-propios-y-de-alegra-no-se-mezclan, modulo/compras, modulo/faltantes, modulo/portal-clientes, modulo/conciliacion-ventas, modulo/conciliacion-cobros, modulo/conciliacion-notas-credito, modulo/historico-debitos-ingreso, modulo/correo-facturas, modulo/facturacion-offline, modulo/archivo-ventas-electronicas, modulo/inventario, tabla/movimiento-inventario]
medido: 2026-10-11
---

Ventas ya vive sobre la base propia (sección 6 del checklist). Se
enlaza acá porque el checklist tuvo, durante meses, siete ítems de esta
sección archivados por error dentro de "## 2. Productos" (líneas 130-177):
"Ver las facturas ya emitidas", "Cómo paga el cliente", "Emitir
electrónicamente una factura ya creada" y otros cuatro, más 37 hallazgos de
Cobros mezclados en el mismo bloque. Se corrigió el 2026-09-20 moviéndolos a
sus secciones (6 y 7) y recontando.

EMISIÓN FISCAL (2026-10-05): [[modulo/hacienda]] implementa preparación,
envío, firma y consulta desde la factura propia. Configuración recibe .p12 y
credenciales; aceptación REAL en pruebas y corte siguen pendientes. La venta
y el comprobante fiscal conservan numeradores separados.

CORREO CON PDF PROPIO (2026-10-04): [[modulo/correo-facturas]] describe la
pantalla y las rutas de envío manual de facturas emitidas, desde la cuenta
del buzón existente. Destinatario confirmado, PDF adjunto y fallos SMTP
controlados. En la rama aislada se puede revisar el formulario pero no enviar;
la recepción real se verifica en el ensayo del corte.

ORIGINALES DE ALEGRA (2026-10-04): [[modulo/archivo-ventas-electronicas, modulo/inventario, tabla/movimiento-inventario]]
descarga los PDF/XML originales de las ventas electrónicas históricas.
Viven en un archivo privado con claves y huellas; no se sustituyen por el
PDF propio ni se presentan como nuevas emisiones.

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

FACTURACIÓN SIN TRADUCTOR (2026-10-04). Pantalla y caché hablan el contrato
propio. [[modulo/facturacion-offline]] explica la actualización IndexedDB v4,
la conservación de colas y claves y la separación de copias históricas. La
marca se comprueba antes de consultar el detalle, además de antes de enviarlo.

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

NO DUPLICAR AL REENVIAR (`idempotencia.js`, tabla `factura_intento`,
migración 041). La clave la pone la tablet una vez y viaja en cada reenvío.
La tabla vino de producción y tenía DOS clases de id en una columna: el id
de Alegra de lo creado allá (facturas y también cotizaciones) y, desde la
rama, el id propio. Ahora la factura propia va en `factura_id` y
`alegra_invoice_id` queda para lo de antes. Lo que se devuelve al reenviar es
siempre nuestro id, o ninguno: un intento de antes del corte se resuelve por
id de Alegra Y número, y solo si tiene huella — las cotizaciones no la
tienen, y la cotización 7 calza en id y en número con la factura 7. La
huella del contrato propio incluye al cliente; la del contrato de antes
(`client`, `id`) quedó idéntica, fijada por una prueba, porque es la que
calculan las tablets que reenvían después del corte.

PENDIENTE, PARA DESPUÉS DEL CORTE: `emitirCon` acepta ids de Alegra
(`client`, línea sin `productoId`). No se puede quitar antes: así llegan las
facturas que una tablet armó sin señal con el sistema anterior.

KARDEX PROPIO (2026-10-05). Crear, editar y anular factura mueve inventario
en la misma transacción. Las notas devuelven fracciones de cuatro decimales
y el costo de la salida original; anular la nota registra reversa. Un error
posterior revierte también movimientos y numerador. Apertura provisional en
cero, sin volver a descontar ventas históricas: [[modulo/inventario]].

2026-10-05: ciclo explícito en portal/pedido de agente y facturación presencial;
al facturar se conserva el recorrido original. Colas antiguas intactas,
filtros de pedidos y validación por cuenta: [[modulo/pedidos-por-ciclo]].

RECORRIDO COMPLETO (2026-10-11), el día después del corte. La factura NACE
SIN COBRAR para todo cliente (venía marcada "Efectivo" para los de contado,
que son casi todos, y salía pagada sola); cobrar en el momento es una
elección que se ve en la barra en cualquier ancho. Una factura cobrada se
corrige anulando su cobro DESDE LA FACTURA (permiso `anular-cobro`), y la
guarda del servidor ya no cuenta cobros ni notas anulados. La ficha y el PDF
muestran el detalle escrito en cada línea y editar no lo borra; con descuento
los totales cierran con la calculadora. El código del producto no distingue
mayúsculas. Todo, con sus porqués, en
[[leccion/lo-que-mueve-plata-no-va-por-omision]].

SIN HACER, a propósito: la venta a medio armar se pierde si se recarga la
página (o si la tablet descarta la pestaña); las referencias repetidas entre
productos activos (`100231`, `27010136`, `7443000380100`) hacen que el código
elija uno cualquiera — es dato del catálogo, no de la pantalla.
