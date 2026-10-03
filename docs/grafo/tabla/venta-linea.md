---
id: tabla/venta-linea
tipo: tabla
titulo: Las ventas — `venta_linea`, una vista sobre las facturas propias emitidas
estado: vigente
archivos:
  - backend/migrations/independencia/034_venta_linea.sql
  - backend/src/modules/ventas/rotacion.js
  - backend/src/modules/ventas/estadisticas.js
  - backend/src/modules/portal-clientes/portal-clientes.sugerencias.service.js
  - backend/src/modules/portal-clientes/portal-clientes.inicio.service.js
  - backend/src/modules/catalogo-agente/catalogo-agente.service.js
  - backend/tests/ventaLinea.test.js
  - backend/tests/rotacionVentas.test.js
aristas:
  reemplaza: [tabla/venta-historico]
  relacionado: [modulo/rentabilidad, modulo/catalogo-agente, modulo/faltantes, leccion/un-borrador-no-es-una-venta, leccion/ids-propios-y-de-alegra-no-se-mezclan]
medido: 2026-10-03
---

`venta_linea (linea_id, factura_id, factura_numero, fecha, cliente_id,
cliente_nombre, producto_id, cantidad, precio_unitario, importe)`: una fila
por línea de factura EMITIDA, con ids propios. Es una VISTA sobre
`factura_linea` + `factura`: no se llena ni se sincroniza.

POR QUÉ REEMPLAZA AL HISTORIAL. `venta_historico` era una copia que se
escribía al facturar en Alegra y se repasaba cada hora contra Alegra. Una
factura hecha en el sistema no existía para la rotación hasta el repaso; se
llaveaba por ids de Alegra; y guardaba la línea como se facturó, así que una
factura editada después (Impresión, al rebajar faltantes) seguía contando lo
que no se entregó. Medido al cambiar (copia local, 12 meses): 139 pares
factura-producto distintos de 51.330, y 8 facturas emitidas que el historial
nunca registró. La vista cuenta lo que la factura dice HOY.

LA REGLA "un borrador no es una venta" ([[leccion/un-borrador-no-es-una-venta]])
la cumple la vista: `WHERE f.estado = 'emitida'`. Pasar una factura a
borrador o anularla la saca de las ventas en el acto.

`importe` es lo vendido SIN IVA con el descuento de la línea restado (el
historial viejo no guardaba descuentos). Las notas de crédito no se restan,
igual que antes: es de la sección 13 del checklist.

QUIÉN LA LEE, y por qué id:
- `ventas/rotacion.js` y `ventas/estadisticas.js`: por `producto.id`. La
  rotación trae además `alegra_item_id` (el `producto.alegra_id`) para lo que
  todavía cruza por ahí: el motor de precios, la Gestión de Catálogo vieja y
  el costo derivado de [[modulo/rentabilidad]].
- Gestión de Catálogo (`productos/taxonomia.service.js`): por `producto.id`.
- El portal (portada, "se lleva junto con", compras anteriores): adentro por
  ids propios; hacia afuera el producto sale con su id de Alegra y el cliente
  llega por el contacto de Alegra de su sesión, hasta que el carrito y el
  pedido pasen a ids propios. La compra anterior ya se identifica por
  `factura.id` — y se filtra por cliente, porque ese id es serial y adivinable.
- El catálogo del agente (historial por cliente y clases A/B): entrega ids de
  Alegra, que es como la tablet guarda sus productos, hasta que su caché pase
  a ids propios.

Los índices que la sostienen ya existían: `factura_linea(producto_id)`,
`factura(cliente_id, fecha)` y `factura(fecha) WHERE estado = 'emitida'`.
La rotación completa tarda ~5 ms; "se lleva junto con" de un carrito de diez
productos, ~220 ms.
