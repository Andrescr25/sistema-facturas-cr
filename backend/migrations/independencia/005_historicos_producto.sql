-- Rama independencia-alegra · 005
-- Los históricos de precio y de costo apuntan al producto propio.
--
-- Hasta ahora solo tenían `alegra_item_id`, obligatorio. Se agrega
-- `producto_id`, se rellena cruzando por `producto.alegra_id`, y
-- `alegra_item_id` deja de ser obligatorio: queda como referencia histórica. Lo que se registre de acá en adelante lleva los dos
-- mientras el producto siga existiendo en Alegra, y solo `producto_id` para
-- los que se creen sin Alegra.

ALTER TABLE precio_historico ADD COLUMN IF NOT EXISTS producto_id INTEGER REFERENCES producto(id);
ALTER TABLE costo_historico  ADD COLUMN IF NOT EXISTS producto_id INTEGER REFERENCES producto(id);

-- Un producto creado sin Alegra no tiene alegra_item_id. Con la columna en
-- NOT NULL, cambiarle el precio reventaba con un 500 (lo encontró la prueba
-- en vivo contra la copia local; el doble de base no tiene restricciones).
ALTER TABLE precio_historico ALTER COLUMN alegra_item_id DROP NOT NULL;
ALTER TABLE costo_historico  ALTER COLUMN alegra_item_id DROP NOT NULL;

UPDATE precio_historico h SET producto_id = p.id
  FROM producto p WHERE h.producto_id IS NULL AND p.alegra_id = h.alegra_item_id;
UPDATE costo_historico h SET producto_id = p.id
  FROM producto p WHERE h.producto_id IS NULL AND p.alegra_id = h.alegra_item_id;

CREATE INDEX IF NOT EXISTS idx_precio_historico_producto ON precio_historico (producto_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_costo_historico_producto  ON costo_historico (producto_id, fecha DESC);
