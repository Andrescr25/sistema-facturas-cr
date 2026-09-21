-- Orden manual de categorías y subcategorías en el catálogo, y nombre de
-- categoría editable para mostrar.
--
-- LA CATEGORÍA REAL DE ALEGRA NUNCA CAMBIA. `nombre_visible` es solo lo que
-- se pinta en pantalla; todo lo que cruza por categoría (productos,
-- subcategorías, filtros) lo sigue haciendo por el nombre real de Alegra.
--
-- POR QUÉ UNA TABLA APARTE Y NO UNA COLUMNA EN OTRO LADO: las categorías de
-- Alegra son planas y no tienen tabla propia acá, solo viven como texto en
-- alegra_products_cache.category. Es el mismo patrón que subcategoria: local,
-- colgada del NOMBRE de Alegra, no de un id que no tenemos.
-- `orden` es NULABLE A PROPÓSITO, sin default. Renombrar una categoría que
-- nunca se movió crea su primera fila acá con solo `nombre_visible` —si
-- `orden` tuviera un default de 0, ese renombre la mandaría de un salto al
-- principio de todas, algo que nadie pidió. NULL es "todavía no se acomodó a
-- mano", y el servicio lo trata igual que si la fila no existiera.
CREATE TABLE IF NOT EXISTS categoria_config (
  categoria      VARCHAR(120) PRIMARY KEY,
  nombre_visible VARCHAR(120),
  orden          INTEGER,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Orden manual DENTRO de cada categoría. Antes las subcategorías salían
-- alfabéticas siempre ("PVC 1" antes que "PVC 1/2" antes que "PVC 2"); esto
-- deja elegir el orden que tenga sentido para quien vende.
ALTER TABLE subcategoria ADD COLUMN IF NOT EXISTS orden INTEGER NOT NULL DEFAULT 0;
