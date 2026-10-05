---
id: modulo/compras
tipo: modulo
titulo: Compras — ya no toca Alegra para registrar una compra
estado: vigente
archivos:
  - backend/src/modules/compras/compras.service.js
  - backend/src/modules/compras/liberarCuentaPorPagar.js
  - backend/src/modules/pagos-recurrentes/scrapers/facturas-recibidas.adapter.js
  - backend/src/modules/revision-precios/revision-precios.service.js
  - backend/services/emailService.js
  - backend/services/databaseService.js
aristas:
  depende_de: [tabla/compra, tabla/compra-linea, tabla/facturas-proveedores, tabla/cuentas-por-pagar]
  bloqueado_por: [bloqueo/prisma-no-se-regenera]
  relacionado: [modulo/hacienda, modulo/inventario, bloqueo/xml-historico-sin-recuperar, modulo/revision-precios, decision/ciclo-de-ruta-como-contexto, decision/orden-enviada-y-archivo-por-recepcion]
medido: 2026-10-05
---

QUÉ ES HOY

El correo trae el XML de la factura electrónica del proveedor. Se guarda un
encabezado en `facturas_proveedores` y sus líneas en
`productos_factura_proveedor` —el BUZÓN, ver [[tabla/facturas-proveedores]]—,
se relacionan con nuestro catálogo y pasan por Revisión de Precios. Al
terminar, el botón "Registrar compra" (`src/modules/compras/compras.service.js`,
`registrarCompra`) crea la fila en [[tabla/compra]] y sus líneas, actualiza
costo y precio de cada producto, y libera la cuenta por pagar
([[tabla/cuentas-por-pagar]]) — todo en una sola transacción, sin tocar
Alegra.

Una línea de REGALÍA (la bonificación del proveedor: otra línea del mismo
producto con 100 % de descuento, costo 0) no toca el costo del producto; si
se le ajustó el precio, se aplica solo el precio
(`actualizarProductoDeLinea`). Mandarla como costo pisaba el costo bueno de
la línea pagada con ₡0.

EL PRODUCTO DE CADA LÍNEA ES EL DE LA LÍNEA del buzón
(`productos_factura_proveedor.producto_id`), el mismo que Revisión de Precios
mostró; el del mapeo queda de respaldo. Hasta el 2026-10-04 se tomaba el del
mapeo, y cuando no coincidían el costo y el precio se le escribían a un
producto distinto del revisado: ver [[modulo/revision-precios]].

`enviarFacturaAlegra`, el camino viejo que hacía `POST /bills` y `PUT /items`,
se retiró del código el 2026-10-04: la pantalla no lo llamaba desde que
existe "Registrar compra".

EL CAMBIO DE FORMA FRENTE A LO VIEJO

`enviarFacturaAlegra` toleraba que crear la factura en Alegra fallara y
aplicaba costos y precios de todos modos ("Continuar para actualizar costos
y precios incluso si falla la factura"). `registrarCompra` es todo o nada:
una compra a medio registrar dejaría el costo de un producto actualizado sin
ningún comprobante que lo respalde. Probado forzando un fallo a mitad de
camino — hace ROLLBACK.

POR QUÉ ERA EL SIGUIENTE MÓDULO GRANDE

Era el último camino, aparte de facturar, que todavía escribía en Alegra. Y
es lo que bloquea retirar `alegra_products_cache`: entre `productos-revision`
(20 usos) y `revision-precios` (12) suman la mitad de las lecturas medidas de
esa caché.

GASTOS RECURRENTES (internet, planes móviles) TAMBIÉN DEJARON DE TOCAR
ALEGRA (2026-09-20)

`registrarComoCompra` (en el adaptador de gastos recurrentes) crea la misma
`compra`/`compra_linea` que una factura normal, pero con `producto_id NULL`
en cada línea —son servicios, no inventario— y sin reconstruir nada por
diferencia: eso solo hacía falta para que Alegra aceptara un bill con items
reales. `liberarCuentaPorPagar` se extrajo a su propio archivo justo para
que esta transacción y la de `registrarCompra` compartan la misma función en
vez de cada una llevar su copia.

El Reporte Contador ya lee ventas y compras propias (sección 13 terminada,
2026-10-03), incluidos los gastos recurrentes registrados como compra.
Cotizaciones también crea facturas propias (sección 10). La dependencia del
buzón/Relacionar Productos y de Inventario respecto de
`alegra_products_cache` todavía está pendiente; no confundirla con esos dos
módulos ya migrados.

QUÉ FALTA

Inventario propio se mueve desde la 042, en esta misma transacción; apertura
provisional en cero autorizada por el usuario, ver
[[bloqueo/conteo-fisico]]—, aunque `compra_linea.cantidad_propia` ya está
lista para cuando exista. Falta el estado de aceptación de cada compra,
junto con el mensaje receptor de Hacienda. Las órdenes de compra por
WhatsApp ya usan `producto.id` (2026-10-03, sección 8); la asignación del
proveedor desde el reporte también usa la ficha propia (sección 13).

"Devolver o rechazar una compra" salió de esta lista (2026-09-20): era una
alucinación de una sesión anterior, nunca un pedido real. Lo que el usuario
pidió de verdad —devolver una factura mal relacionada para corregirla— ya
existe (`devolverFactura` en `revision-precios.service.js`, arriba en
`archivos:`) y no tiene nada que ver con `compra`.

KARDEX PROPIO (2026-10-05). Registrar suma `cantidad_propia` y valora las
entradas con costo de la línea, impuestos y descuento, dentro de la misma
transacción que compra, costo/precio y CxP. Repetir el registro no vuelve a
sumar. No convertir las compras históricas ya cargadas en nuevas entradas.
Ver [[tabla/movimiento-inventario]] y [[modulo/inventario]].

HACIENDA (2026-10-05): [[modulo/hacienda]] describe configuración, emisión y
seguimiento fiscal separados; no repetir el movimiento comercial al enviar.
