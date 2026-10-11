-- Sección 12, parte 3. La lista manual también admite productos sin Alegra.
-- `id` identifica la entrada; `producto_id`, la ficha propia. Una entrada
-- histórica sin correspondencia se conserva, marcada, y se puede quitar por
-- su id de entrada. Nunca se interpreta su número de Alegra como producto.id.
BEGIN;
ALTER TABLE producto_nuevo_catalogo ADD COLUMN IF NOT EXISTS id SERIAL;
ALTER TABLE producto_nuevo_catalogo
  ADD COLUMN IF NOT EXISTS producto_id INTEGER REFERENCES producto(id);
UPDATE producto_nuevo_catalogo n SET producto_id = p.id
  FROM producto p WHERE p.alegra_id = n.alegra_item_id AND n.producto_id IS NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'producto_nuevo_catalogo'::regclass
      AND contype = 'p' AND pg_get_constraintdef(oid) = 'PRIMARY KEY (id)'
  ) THEN
    ALTER TABLE producto_nuevo_catalogo DROP CONSTRAINT IF EXISTS producto_nuevo_catalogo_pkey;
    ALTER TABLE producto_nuevo_catalogo ADD PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE producto_nuevo_catalogo ALTER COLUMN alegra_item_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS producto_nuevo_catalogo_producto_unico
  ON producto_nuevo_catalogo (producto_id) WHERE producto_id IS NOT NULL;
DO $$
DECLARE pendientes INTEGER;
BEGIN
  SELECT COUNT(*) INTO pendientes FROM producto_nuevo_catalogo WHERE producto_id IS NULL;
  IF pendientes > 0 THEN
    RAISE NOTICE 'Productos nuevos: % entradas históricas sin ficha propia. Se conservan para conciliar.', pendientes;
  END IF;
END $$;
COMMIT;
