-- Subcategorías dentro de cada categoría.
--
-- POR QUÉ. Las categorías vienen de Alegra y son PLANAS: 18 en total. Eso deja
-- bolsas enormes donde no se encuentra nada. "Productos de PVC" son 118 piezas
-- con sanitario, potable, conduit —que ni siquiera es plomería—, pegamentos y
-- accesorios de baño todo revuelto. Lo mismo pasa en Eléctrica con los
-- bombillos y en Pesca.
--
-- LA SUBCATEGORÍA ES NUESTRA, no de Alegra. Alegra no tiene dónde guardarla, y
-- tampoco hace falta: sirve para ordenar el catálogo acá adentro.
--
-- SE CUELGA DEL NOMBRE DE LA CATEGORÍA, no de un id. Alegra las identifica con
-- un id propio, pero lo que la caché de productos guarda es el NOMBRE
-- (`alegra_products_cache.category`), y es por ahí por donde se cruza. Si algún
-- día se le cambia el nombre a una categoría en Alegra, sus subcategorías
-- quedan sueltas; se arregla renombrándolas acá, y es preferible a inventar un
-- id que la caché no tiene.

CREATE TABLE IF NOT EXISTS subcategoria (
  id         SERIAL PRIMARY KEY,
  categoria  VARCHAR(120) NOT NULL,
  nombre     VARCHAR(80)  NOT NULL,
  activo     BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Dos subcategorías con el mismo nombre en la misma categoría no se pueden
-- distinguir en un desplegable. Se compara en minúsculas porque "Sanitario" y
-- "SANITARIO" son la misma para quien la lee.
CREATE UNIQUE INDEX IF NOT EXISTS subcategoria_unica
  ON subcategoria (categoria, lower(nombre));

CREATE INDEX IF NOT EXISTS idx_subcategoria_categoria
  ON subcategoria (categoria) WHERE activo;

-- La columna es LOCAL y sobrevive a la sincronización con Alegra: ese UPDATE
-- nombra sus columnas una por una y no toca las nuestras, igual que ya pasa
-- con `hidden_locally`.
--
-- ON DELETE SET NULL: borrar una subcategoría no puede llevarse por delante el
-- producto. Queda sin clasificar, que es de donde venía.
ALTER TABLE alegra_products_cache
  ADD COLUMN IF NOT EXISTS subcategoria_id INTEGER REFERENCES subcategoria(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_productos_subcategoria
  ON alegra_products_cache (subcategoria_id) WHERE subcategoria_id IS NOT NULL;
