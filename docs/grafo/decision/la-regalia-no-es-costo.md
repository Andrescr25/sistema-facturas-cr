---
id: decision/la-regalia-no-es-costo
tipo: decision
titulo: Una línea de regalía (100 % de descuento) nunca toca el costo del producto
estado: vigente
archivos:
  - backend/src/modules/compras/compras.service.js
  - backend/tests/registrarCompra.test.js
aristas:
  relacionado: [modulo/revision-precios, modulo/compras, leccion/precio-sin-iva-costo-con-iva]
medido: 2026-10-20
---

## Vigencia desde el 2026-10-20

Se retiraron los selectores/asignaciones de semana y el enlace de compras
a órdenes desde Revisión de precios. La ruta actual y próxima visita siguen
vigentes; los documentos y envíos anteriores se conservan. El alcance y las pruebas actuales están en
[el informe del retiro](../../informes/simplificacion-sin-semanas-2026-10-20.md).


**En esta rama** la decisión vive en `actualizarProductoDeLinea`
(`compras.service.js`): una línea de regalía no cambia `costo_con_iva`, y si
se le ajustó el precio se aplica solo el precio. Donde nació —
`actualizacionDeLinea`, del envío a Alegra— se retiró el 2026-10-04.

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
