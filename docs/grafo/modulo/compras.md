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
  bloqueado_por: [bloqueo/el-xml-no-se-guarda, bloqueo/prisma-no-se-regenera, bloqueo/conteo-fisico]
  relacionado: [modulo/inventario]
medido: 2026-09-20
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

`enviarFacturaAlegra` (`revision-precios.service.js:595-858`), el camino
viejo que hacía `POST /bills` y `PUT /items`, sigue en el código pero la
pantalla ya no lo llama — nada la borra todavía, es la siguiente limpieza.

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

Consecuencia de tránsito: el Reporte Contador (sección 13, sin migrar)
sigue leyendo de Alegra, así que un gasto recurrente nuevo no aparece ahí
todavía — el mismo hueco que ya tienen Cotizaciones e Inventario con
`alegra_products_cache`.

QUÉ FALTA

Inventario NO se mueve todavía —bloqueado por el conteo físico, ver
[[bloqueo/conteo-fisico]]—, aunque `compra_linea.cantidad_propia` ya está
lista para cuando exista. Devolver o rechazar una compra, el estado de
aceptación, y órdenes de compra por WhatsApp usando `producto.id` en vez del
id de Alegra.
