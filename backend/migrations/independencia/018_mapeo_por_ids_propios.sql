-- El mapeo producto ↔ proveedor apunta a NUESTROS ids.
--
-- `supplier_product_mapping` se llavea por `alegra_item_id` y `supplier_cedula`.
-- El id de Alegra es de un sistema ajeno, y la cédula es un texto que llega
-- escrito de tres formas distintas según de dónde venga la factura. Mientras
-- esas sean las llaves, Compras no puede dejar de depender de Alegra.
--
-- LAS COLUMNAS VIEJAS SE CONSERVAN hasta el corte, igual que en la 017: las dos
-- formas conviven y la vieja se puede revisar si algo no cuadra.
--
-- Medido antes de escribir esto, sobre los 2.060 mapeos:
--   · los 2.060 encuentran su proveedor por cédula;
--   · 2.049 encuentran su producto por el id de Alegra;
--   · de los 11 que no, 7 se recuperan por NOMBRE EXACTO —son `REF-…`, un id
--     inventado de cuando el producto no tenía id de Alegra— y cada uno calza
--     con exactamente un producto, no con varios;
--   · quedan 4 sin producto: tres "TEST MEDICAMENTO API FIX" (pruebas de una
--     corrección de API) y el 2002, usado una vez en julio. Se dejan en NULL,
--     no se borran: decidir qué hacer con ellos es del negocio.

ALTER TABLE supplier_product_mapping
  ADD COLUMN IF NOT EXISTS producto_id  INTEGER REFERENCES producto(id),
  ADD COLUMN IF NOT EXISTS proveedor_id INTEGER REFERENCES proveedor(id);

-- ── Por el id de Alegra, que es lo que cubre casi todo ──
UPDATE supplier_product_mapping m
   SET producto_id = p.id
  FROM producto p
 WHERE p.alegra_id = m.alegra_item_id::text
   AND m.producto_id IS NULL;

-- ── Los `REF-…`, por nombre exacto y SOLO si no hay ambigüedad ──
-- El `COUNT(*) = 1` no es decorativo: si dos productos se llamaran igual, esto
-- estaría eligiendo uno al azar y dejando el precio de compra colgado del
-- equivocado.
UPDATE supplier_product_mapping m
   SET producto_id = u.id
  FROM (
    SELECT lower(nombre) AS nombre, MIN(id) AS id
      FROM producto
     GROUP BY lower(nombre)
    HAVING COUNT(*) = 1
  ) u
 WHERE m.producto_id IS NULL
   AND lower(m.alegra_name) = u.nombre;

-- ── El proveedor, por cédula ──
UPDATE supplier_product_mapping m
   SET proveedor_id = pr.id
  FROM proveedor pr
 WHERE pr.identificacion = m.supplier_cedula
   AND m.proveedor_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_mapeo_producto  ON supplier_product_mapping (producto_id);
CREATE INDEX IF NOT EXISTS idx_mapeo_proveedor ON supplier_product_mapping (proveedor_id);

-- Un proveedor no puede tener dos veces el mismo código para productos
-- distintos: es lo que hace que al leer su factura se sepa cuál es.
CREATE UNIQUE INDEX IF NOT EXISTS mapeo_proveedor_codigo_unico
  ON supplier_product_mapping (proveedor_id, lower(supplier_code))
  WHERE proveedor_id IS NOT NULL;
