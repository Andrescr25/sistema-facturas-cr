---
id: tabla/venta-historico
tipo: tabla
titulo: El historial de ventas viejo — en esta rama ya no se lee ni se llena
estado: retirado
archivos:
  - backend/migrations/add_venta_historico.sql
aristas:
  relacionado: [tabla/venta-linea, leccion/un-borrador-no-es-una-venta]
medido: 2026-10-03
---

EN ESTA RAMA, RETIRADA (2026-10-03, sección 12 del checklist). Las ventas
salen de [[tabla/venta-linea]], una vista sobre las facturas propias. Se
quitaron `sincronizarHistorialCompras` y `registrarFacturaEnHistorico`, la
tarea que la repasaba cada hora contra Alegra y su ruta. La tabla sigue en
la base con lo que tenía, sin que nadie la toque; `rotacionVentas.test.js`
falla si algún archivo vuelve a leerla o a escribirla.

En `main` sigue viva y es la fuente de la rotación: `venta_historico
(alegra_invoice_id, alegra_item_id, cliente_id, cliente_nombre, cantidad,
precio_unitario, fecha_emision)`, única por `(factura, producto)`, llenada al
crear la factura en Alegra y repasada cada hora y cada día contra Alegra.
El detalle está en el grafo de esa rama.
