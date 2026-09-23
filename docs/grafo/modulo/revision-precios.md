---
id: modulo/revision-precios
tipo: modulo
titulo: Revisión de Precios — la factura del proveedor se manda a Alegra y actualiza costos
estado: vigente
archivos:
  - backend/src/modules/revision-precios/revision-precios.service.js
  - backend/src/modules/precios/costo.js
  - backend/utils/impuestosAlegra.js
  - backend/tests/facturaProveedorNoSeDuplica.test.js
aristas:
  depende_de: [tabla/supplier-product-mapping, tabla/alegra-products-cache]
  relacionado: [decision/la-regalia-no-es-costo, leccion/factura-enviada-no-se-repite, leccion/el-impuesto-es-de-cada-linea, leccion/precio-sin-iva-costo-con-iva]
medido: 2026-09-23
---

Las facturas electrónicas de los proveedores llegan por correo, se relacionan
producto por producto con el catálogo (el mapeo queda por cédula, ver
[[tabla/supplier-product-mapping]]), y acá se revisan los precios de venta
antes de mandarlas. `enviarFacturaAlegra` hace dos cosas:

1. Crea la factura de compra en Alegra (`POST /bills`), con el impuesto de
   CADA línea tomado de `GET /taxes` (`utils/impuestosAlegra.js`, caché de
   6 h) — ver [[leccion/el-impuesto-es-de-cada-linea]].
2. Actualiza costo y, si se ajustó, precio de cada producto (`PUT /items`),
   con la línea resuelta por `actualizacionDeLinea`. El costo va anidado en
   `inventory.unitCost`: un `cost` suelto en la raíz Alegra lo ignora sin
   avisar.

Las dos trampas que ya costaron: una línea de regalía pisaba el costo con ₡0
([[decision/la-regalia-no-es-costo]]), y reenviar una factura ENVIADA
duplicaba el gasto ([[leccion/factura-enviada-no-se-repite]]).

En la rama `independencia-alegra` esto se reemplaza por "Registrar compra",
que no toca Alegra; ver el grafo de esa rama.
