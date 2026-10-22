-- Agrupaciones visuales del catálogo; cada presentación conserva su producto.
-- La foto pertenece a la marca EN su subcategoría, no al producto individual.
BEGIN;
CREATE TABLE IF NOT EXISTS marca_catalogo (
  id SERIAL PRIMARY KEY,
  subcategoria_id INTEGER NOT NULL REFERENCES subcategoria(id) ON DELETE CASCADE,
  nombre VARCHAR(80) NOT NULL CHECK (length(btrim(nombre)) > 0),
  imagen JSONB,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS marca_catalogo_nombre_unico
  ON marca_catalogo (subcategoria_id, lower(btrim(nombre)));
ALTER TABLE producto ADD COLUMN IF NOT EXISTS marca_catalogo_id INTEGER
  REFERENCES marca_catalogo(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS producto_marca_catalogo_idx
  ON producto(marca_catalogo_id) WHERE marca_catalogo_id IS NOT NULL;

-- También cubre editar producto y los lotes existentes: moverlo de categoría
-- o subcategoría suelta la agrupación anterior en la misma escritura.
CREATE OR REPLACE FUNCTION validar_marca_catalogo_producto() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.marca_catalogo_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM marca_catalogo m JOIN subcategoria s ON s.id=m.subcategoria_id
      JOIN categoria_producto c ON c.nombre=s.categoria
    WHERE m.id=NEW.marca_catalogo_id AND m.subcategoria_id=NEW.subcategoria_id
      AND c.id=NEW.categoria_id
  ) THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.marca_catalogo_id IS NOT DISTINCT FROM OLD.marca_catalogo_id
    AND (NEW.subcategoria_id IS DISTINCT FROM OLD.subcategoria_id
      OR NEW.categoria_id IS DISTINCT FROM OLD.categoria_id) THEN
    NEW.marca_catalogo_id := NULL;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'La marca debe pertenecer a la subcategoría del producto.' USING ERRCODE='23514';
END $$;
DROP TRIGGER IF EXISTS producto_validar_marca_catalogo ON producto;
CREATE TRIGGER producto_validar_marca_catalogo
  BEFORE INSERT OR UPDATE OF categoria_id,subcategoria_id,marca_catalogo_id ON producto
  FOR EACH ROW EXECUTE FUNCTION validar_marca_catalogo_producto();
COMMIT;
