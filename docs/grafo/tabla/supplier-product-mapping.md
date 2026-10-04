---
id: tabla/supplier-product-mapping
tipo: tabla
titulo: Quién vende qué — el vínculo producto ↔ proveedor, por cédula
estado: vigente
archivos:
  - backend/prisma/schema.prisma
  - backend/src/modules/productos-revision/relacionPropia.js
  - backend/src/modules/productos/productos.service.js
  - backend/src/modules/proveedores/proveedores.maestro.service.js
  - backend/migrations/independencia/038_relacion_de_compra_por_producto_propio.sql
aristas:
  relacionado: [leccion/proveedor-por-cedula, modulo/revision-precios, modulo/relacionar-productos, leccion/el-doble-de-prisma-no-valida-tipos]
medido: 2026-10-03
---

`supplier_product_mapping`: `supplier_cedula` + `supplier_code` (el código del
proveedor) → **`producto_id`** (`producto.id`) y `proveedor_id`, con
`factor_conversion`, `times_used` y `last_used_date`. Se llena al relacionar
facturas de proveedor; la primera vez lo decide una persona, después se reusa
solo.

Es LA fuente de "a quién le compro este producto" — ni la tabla `proveedores`
ni `GET /proveedores` sirven para eso, ver [[leccion/proveedor-por-cedula]].
El "proveedor principal" de un producto es el mapeo con más `times_used`
(desempate por el más reciente).

**El producto se cruza por `producto_id`, no por `alegra_item_id`.** Desde el
2026-10-03 lo escribe [[modulo/relacionar-productos]] y lo leen así el
maestro de productos (filtro por proveedor y "sin proveedor") y las fichas de
proveedores (cuántos productos le compramos). Medido al cambiarlo: por el id
de Alegra, un producto creado en el sistema salía siempre "sin proveedor", y
7 asignaciones manuales (`origen = 'manual_temp'`) tampoco contaban, porque
en `alegra_item_id` guardan una referencia (`REF-…`) y no un id.

`alegra_item_id`, `alegra_reference` y `alegra_name` quedan como referencia de
lo que vino de Alegra y los sigue leyendo lo que aún no migró (Revisión de
Precios, el buzón, el catálogo viejo). **`alegra_item_id` y `alegra_name` son
NOT NULL a propósito**: un producto sin ficha en Alegra guarda `''`. El porqué
está en [[leccion/el-doble-de-prisma-no-valida-tipos]].

`created_date` y `last_used_date` no tienen zona y van en UTC, que es como
los escribe Prisma; lo que se escribe por SQL usa `NOW() AT TIME ZONE 'UTC'`
para no mezclar dos relojes al ordenar por último uso.
