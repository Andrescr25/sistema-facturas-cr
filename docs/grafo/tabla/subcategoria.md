---
id: tabla/subcategoria
tipo: tabla
titulo: Subcategorías — nuestras, colgadas del NOMBRE de la categoría de Alegra
estado: vigente
archivos:
  - backend/migrations/add_subcategorias.sql
  - backend/migrations/add_orden_categorias.sql
  - backend/src/modules/catalogo/subcategorias.service.js
  - backend/tests/subcategorias.test.js
aristas:
  relacionado: [tabla/alegra-products-cache, tabla/categoria-config, decision/orden-canonico-compartido]
medido: 2026-09-23
---

`subcategoria (id, categoria, nombre, activo, orden)`, única por
`(categoria, lower(nombre))`. `categoria` es el nombre REAL de Alegra, no el
visible. Los productos la apuntan con `alegra_products_cache.subcategoria_id`
(`ON DELETE SET NULL`).

Reglas que el servicio hace cumplir:

- Un producto solo puede ir a una subcategoría de SU categoría (también en
  el lote).
- Cambiar un producto de categoría pone su `subcategoria_id` en NULL en el
  mismo `UPDATE`: si no, queda apuntando a una subcategoría de otra
  categoría.
- Borrar solo se puede si está en 0 productos (409 si no).
- `orden` es manual, dentro de su categoría ([[decision/orden-canonico-compartido]]).
