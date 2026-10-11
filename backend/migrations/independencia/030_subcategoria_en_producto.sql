-- Rama independencia-alegra — 030: la subcategoría pasa al producto propio
--
-- En `main` la subcategoría cuelga de `alegra_products_cache.subcategoria_id`
-- (migrations/add_subcategorias.sql). Acá el maestro es `producto`, así que la
-- clasificación tiene que vivir en él: si no, Gestión de Catálogo y el
-- catálogo del agente seguirían dependiendo de la caché de Alegra.
--
-- Las tablas `subcategoria` y `categoria_config` NO se crean acá: vienen de
-- producción con cada copia (las creó `main`). Siguen colgadas del NOMBRE de
-- la categoría, que en esta rama es `categoria_producto.nombre`; renombrar
-- una categoría arrastra ese nombre (productos.service.editarCategoria).
--
-- LA COPIA DE LO CLASIFICADO EN MAIN es la misma que corre
-- cargar-productos.js después de cada carga (hasta el corte, `main` sigue
-- clasificando sobre la caché):
--   1. se copia la subcategoría de la caché SOLO si es de la categoría que el
--      producto tiene acá — una de otra categoría desordenaría el catálogo;
--   2. se suelta la que quedó de otra categoría (el producto se movió).

ALTER TABLE producto
  ADD COLUMN IF NOT EXISTS subcategoria_id INTEGER REFERENCES subcategoria(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_producto_subcategoria
  ON producto (subcategoria_id) WHERE subcategoria_id IS NOT NULL;

UPDATE producto p
   SET subcategoria_id = c.subcategoria_id
  FROM alegra_products_cache c
  JOIN subcategoria s ON s.id = c.subcategoria_id
  JOIN categoria_producto cp ON cp.nombre = s.categoria
 WHERE c.alegra_id = p.alegra_id
   AND cp.id = p.categoria_id
   AND p.subcategoria_id IS DISTINCT FROM c.subcategoria_id;

UPDATE producto p
   SET subcategoria_id = NULL
  FROM subcategoria s
 WHERE s.id = p.subcategoria_id
   AND s.categoria IS DISTINCT FROM (SELECT nombre FROM categoria_producto WHERE id = p.categoria_id);
