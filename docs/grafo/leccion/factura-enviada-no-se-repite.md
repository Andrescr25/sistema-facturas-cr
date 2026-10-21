---
id: leccion/factura-enviada-no-se-repite
tipo: leccion
titulo: ENVIADA prueba que la compra ya existe en Alegra — reenviarla duplica el gasto
estado: retirado
archivos:
  - backend/src/modules/compras/compras.service.js
  - backend/src/modules/revision-precios/revision-precios.service.js
  - backend/tests/registrarCompra.test.js
aristas:
  relacionado: [modulo/revision-precios, modulo/compras]
medido: 2026-10-20
---

## Vigencia desde el 2026-10-20

Se retiraron los selectores/asignaciones de semana y el enlace de compras
a órdenes desde Revisión de precios. La ruta actual y próxima visita siguen
vigentes; los documentos y envíos anteriores se conservan. El alcance y las pruebas actuales están en
[el informe del retiro](../../informes/simplificacion-sin-semanas-2026-10-20.md).


**RETIRADA EN ESTA RAMA (2026-10-04).** `enviarFacturaAlegra` se borró: acá la
compra se registra con `registrarCompra`, y lo que impide registrarla dos
veces ya no es el estado `ENVIADA` sino algo más directo — ¿existe ya una fila
en `compra` para esta factura del buzón? (409 si existe; probado en
`registrarCompra.test.js`). `devolverFactura` tampoco deja devolver a
relacionar una factura ya registrada. Lo de abajo es cómo pasó en `main`, y
por qué la guarda tiene que estar en el servidor y no en el botón.

En Revisión de Precios, el estado `ENVIADA` de una factura de proveedor es la
prueba de que su factura de compra se creó en Alegra: cuando ese paso falla,
`enviarFacturaAlegra` deja el estado atrás a propósito, para reintentar.

Hasta 2026-09-04 el historial de "Enviadas" abría la misma pantalla de
revisión con "Devolver a Relacionar" y "Enviar a Alegra" activos. Devolver y
reenviar creaba una SEGUNDA compra por la misma factura: el gasto contado dos
veces (había 838 facturas en ese estado).

Las guardas están en el SERVICIO (409 en `devolverFactura` y en
`enviarFacturaAlegra`), no solo en la pantalla, porque el botón no era el
único camino. Si hay que rehacer una factura enviada, primero se anula la
compra en Alegra.

El patrón general: cuando una pantalla de historial reutiliza la vista de
edición, revisar qué acciones quedan activas ahí.
