---
id: tabla/subcategoria
tipo: tabla
titulo: Subcategorías — nuestras, colgadas del NOMBRE de la categoría de Alegra
estado: vigente
archivos:
  - backend/migrations/add_subcategorias.sql
  - backend/migrations/add_orden_categorias.sql
  - backend/src/modules/productos/taxonomiaTablas.js
  - backend/src/modules/productos/taxonomia.service.js
  - backend/tests/taxonomiaTablas.test.js
aristas:
  relacionado: [tabla/alegra-products-cache, tabla/categoria-config, decision/orden-canonico-compartido, modulo/gestion-catalogo]
medido: 2026-10-04
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

EN `independencia-alegra`: los productos la apuntan con
`producto.subcategoria_id` (migración 030), porque el maestro es `producto`.
La columna de la caché se sigue llenando en `main` hasta el corte y se copia
en cada carga de productos. Ver `modulo/gestion-catalogo`.

EN ESTA RAMA el producto guarda su subcategoría en `producto.subcategoria_id`
(migración `independencia/030`), no en la caché de Alegra. Crear, renombrar,
ordenar y listar están en `taxonomiaTablas.js`; asignar, mover y borrar, en
`taxonomia.service.js`. El conteo de productos de cada una mira `producto` con
el mismo "a la vista" que las listas: al compararlo el 2026-10-04 contra el
que salía de la caché, las 183 subcategorías eran las mismas y en el mismo
orden, pero la caché contaba 1.998 productos clasificados y el maestro 1.837.

