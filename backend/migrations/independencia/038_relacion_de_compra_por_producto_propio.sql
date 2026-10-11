-- Rama independencia-alegra — 038: la línea de una factura de proveedor se
-- relaciona con un `producto.id` (sección 8 / Relacionar Productos).
--
-- Hasta acá la relación vivía en dos lugares y en los dos por el id de Alegra:
--   · `productos_factura_proveedor.alegra_item_id` — qué producto es ESTA línea
--   · `supplier_product_mapping.alegra_item_id`   — a qué producto corresponde
--     ese código de ese proveedor, para las facturas que vengan
--
-- El mapeo ya tenía `producto_id` desde la 018. La línea no: se le agrega acá.
--
-- POR QUÉ LA LÍNEA LLEVA EL SUYO y no alcanza con el del mapeo: no siempre son
-- el mismo producto. Si el mismo código del proveedor se vuelve a relacionar
-- con otro producto en una factura posterior, el mapeo cambia para todos pero
-- las líneas viejas conservan el producto con el que se registraron. Medido en
-- la copia local: 70 de 8.478 líneas relacionadas tienen un producto distinto
-- del que hoy dice su mapeo (TOALLA P/ MANOS 180 MTS, 12 líneas; JGO BROCAS
-- METAL 1X6, 9…). Tomar el del mapeo les reescribiría la historia.
--
-- Y UN PRODUCTO SIN FICHA EN ALEGRA TIENE QUE PODER RELACIONARSE. La línea
-- guarda su `producto_id` y deja `alegra_item_id` en NULL. El MAPEO no puede:
-- sus columnas `alegra_item_id` y `alegra_name` SIGUEN SIENDO NOT NULL, a
-- propósito. El cliente de Prisma generado las declara obligatorias y no se
-- regenera en esta rama (comparte `node_modules` con `main`); una sola fila
-- con NULL revienta cada lectura del mapeo — el buzón, Revisión de Precios,
-- abrir una factura para relacionarla. El mapeo de un producto sin ficha
-- guarda '' (ver productos-revision/relacionPropia.js). Cuando se regenere el
-- cliente con el campo opcional, se sueltan las dos y '' pasa a NULL.
--
-- Se puede correr las veces que haga falta.

ALTER TABLE productos_factura_proveedor
  ADD COLUMN IF NOT EXISTS producto_id INTEGER REFERENCES producto(id);

-- El producto de la línea: el de SU id de Alegra, no el del mapeo.
UPDATE productos_factura_proveedor l
   SET producto_id = p.id
  FROM producto p
 WHERE p.alegra_id = l.alegra_item_id::text
   AND l.producto_id IS DISTINCT FROM p.id;

-- Una línea que ya no está relacionada no apunta a ningún producto.
UPDATE productos_factura_proveedor
   SET producto_id = NULL
 WHERE alegra_item_id IS NULL AND producto_id IS NOT NULL
   AND estado_relacionado <> 'RELACIONADO';

CREATE INDEX IF NOT EXISTS idx_linea_buzon_producto
  ON productos_factura_proveedor (producto_id) WHERE producto_id IS NOT NULL;

-- El candado del mapeo (ver arriba). En una base donde nunca se soltó, estas
-- cuatro líneas no cambian nada.
UPDATE supplier_product_mapping SET alegra_item_id = '' WHERE alegra_item_id IS NULL;
UPDATE supplier_product_mapping m
   SET alegra_name = COALESCE((SELECT p.nombre FROM producto p WHERE p.id = m.producto_id), m.supplier_desc)
 WHERE m.alegra_name IS NULL;
ALTER TABLE supplier_product_mapping ALTER COLUMN alegra_item_id SET NOT NULL;
ALTER TABLE supplier_product_mapping ALTER COLUMN alegra_name SET NOT NULL;

-- Los mapeos creados después de la 018 que hayan quedado sin sus ids propios.
UPDATE supplier_product_mapping m
   SET producto_id = p.id
  FROM producto p
 WHERE p.alegra_id = NULLIF(m.alegra_item_id::text, '') AND m.producto_id IS NULL;

UPDATE supplier_product_mapping m
   SET proveedor_id = pr.id
  FROM proveedor pr
 WHERE pr.identificacion = m.supplier_cedula AND m.proveedor_id IS NULL;

DO $$
DECLARE lineas INTEGER; mapeos INTEGER;
BEGIN
  SELECT COUNT(*) INTO lineas FROM productos_factura_proveedor
   WHERE estado_relacionado = 'RELACIONADO' AND producto_id IS NULL;
  SELECT COUNT(*) INTO mapeos FROM supplier_product_mapping WHERE producto_id IS NULL;
  IF lineas + mapeos > 0 THEN
    RAISE NOTICE 'Relaciones sin producto propio: % líneas y % mapeos (productos que ya no tienen ficha). Se conservan.', lineas, mapeos;
  END IF;
END $$;
