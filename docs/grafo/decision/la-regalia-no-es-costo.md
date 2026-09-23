---
id: decision/la-regalia-no-es-costo
tipo: decision
titulo: Una línea de regalía (100 % de descuento) nunca toca el costo del producto
estado: vigente
archivos:
  - backend/src/modules/revision-precios/revision-precios.service.js
  - backend/tests/facturaProveedorNoSeDuplica.test.js
aristas:
  relacionado: [modulo/revision-precios, leccion/precio-sin-iva-costo-con-iva]
medido: 2026-09-23
---

La bonificación de un proveedor viene como OTRA línea del mismo producto con
100 % de descuento: su costo sale ₡0. Mandarla a Alegra pisaba el costo bueno
de la línea pagada con ₡0 (4 veces en el histórico) — y como las líneas se
mandan en paralelo, cuál quedaba dependía de cuál llegaba último.

`actualizacionDeLinea` decide qué se manda por una línea: con costo 0 no se
manda costo; si alguien ajustó el precio en esa línea, se manda solo el
precio; si no, no se manda nada. Una regalía es mercadería gratis dentro de
una compra, no el costo del producto.

La rama `independencia-alegra` aplica la misma regla en
`actualizarProductoDeLinea` (Registrar compra).
