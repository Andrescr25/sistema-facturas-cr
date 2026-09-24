---
id: leccion/factura-enviada-no-se-repite
tipo: leccion
titulo: ENVIADA prueba que la compra ya existe en Alegra — reenviarla duplica el gasto
estado: vigente
archivos:
  - backend/src/modules/revision-precios/revision-precios.service.js
  - backend/tests/facturaProveedorNoSeDuplica.test.js
aristas:
  relacionado: [modulo/revision-precios]
medido: 2026-09-23
---

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
