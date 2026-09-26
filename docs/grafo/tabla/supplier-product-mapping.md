---
id: tabla/supplier-product-mapping
tipo: tabla
titulo: Quién vende qué — el vínculo producto ↔ proveedor, por cédula
estado: vigente
archivos:
  - backend/prisma/schema.prisma
  - backend/src/modules/catalogo/catalogo.service.js
aristas:
  relacionado: [leccion/proveedor-por-cedula, modulo/revision-precios]
medido: 2026-09-25
---

`supplier_product_mapping`: `supplier_cedula` + `supplier_code` (el código del
proveedor) → `alegra_item_id`, con `factor_conversion`, `times_used` y
`last_used_date`. Se llena al relacionar facturas de proveedor; la primera
vez lo decide una persona, después se reusa solo.

Es LA fuente de "a quién le compro este producto" — ni la tabla `proveedores`
ni `GET /proveedores` sirven para eso, ver [[leccion/proveedor-por-cedula]].
El "proveedor principal" de un producto es el mapeo con más `times_used`
(desempate por el más reciente).
