-- Rama independencia-alegra — 032: faltantes y cola de impresión con los ids
-- PROPIOS (sección 11 del checklist, pasos 2 y 3).
--
-- 1. CADA FALTANTE APUNTA A `factura` Y A `producto`. Hasta acá colgaba de
--    la tabla vieja `facturas` (que se llenaba desde Alegra) y de `productos`
--    (la copia vieja del catálogo). Una factura propia no tiene fila en
--    `facturas` sin el puente de la 031, y un producto nuevo no tiene fila en
--    `productos`: el faltante no tenía de dónde colgarse.
--
-- 2. LA COLA DE IMPRESIÓN (`facturas_reimpresion`) también, por la misma razón.
--
-- 3. LAS COLUMNAS VIEJAS SE RENOMBRAN, NO SE BORRAN NI SE REUSAN.
--    `factura_id` pasa a `factura_vieja_id` y `producto_id` a
--    `producto_viejo_id`. Reusar el nombre `factura_id` para el id propio
--    sería la trampa de siempre: los dos son seriales, y un código traído de
--    developer que escribiera ahí el id de la tabla vieja colgaría el faltante
--    de OTRA factura sin un solo error. Con el nombre cambiado, ese código
--    falla en voz alta ("column factura_id does not exist").
--    Los datos viejos quedan en su columna para poder revisar el corte.
--
-- `facturas_pendientes` no se toca: nadie escribe en ella y su `factura_id`
-- sigue siendo el de la tabla vieja. Las dos limpiezas de faltantes dejaron
-- de vaciarla (la buscaban con el id viejo de cada faltante).

-- 1 ─────────────────────────────────────────────────────────────────────────
ALTER TABLE faltantes
  ADD COLUMN IF NOT EXISTS factura_propia_id INTEGER REFERENCES factura(id),
  ADD COLUMN IF NOT EXISTS producto_propio_id INTEGER REFERENCES producto(id);

DO $$
DECLARE
  sin_factura INTEGER;
  sin_producto INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'faltantes' AND column_name = 'factura_id') THEN

    -- La factura, por el puente de la 031.
    UPDATE faltantes f
       SET factura_propia_id = fa.factura_propia_id
      FROM facturas fa
     WHERE fa.id = f.factura_id
       AND f.factura_propia_id IS NULL;

    -- El producto, por el id de Alegra, que en las dos tablas es la
    -- identidad real del producto (producto.alegra_id es único).
    UPDATE faltantes f
       SET producto_propio_id = pr.id
      FROM productos p
      JOIN producto pr ON pr.alegra_id = p.alegra_id::text
     WHERE p.id = f.producto_id
       AND f.producto_propio_id IS NULL;

    -- Si no, por la referencia, y solo cuando calza con UN producto: con dos,
    -- se estaría eligiendo al azar.
    UPDATE faltantes f
       SET producto_propio_id = (SELECT pr.id FROM producto pr WHERE pr.referencia = p.codigo)
      FROM productos p
     WHERE p.id = f.producto_id
       AND f.producto_propio_id IS NULL
       AND p.codigo IS NOT NULL
       AND (SELECT COUNT(*) FROM producto pr WHERE pr.referencia = p.codigo) = 1;

    SELECT COUNT(*) FILTER (WHERE factura_propia_id IS NULL),
           COUNT(*) FILTER (WHERE producto_propio_id IS NULL)
      INTO sin_factura, sin_producto
      FROM faltantes;
    IF sin_factura > 0 OR sin_producto > 0 THEN
      RAISE NOTICE 'faltantes sin enlazar: % sin factura propia, % sin producto propio (quedan fuera de los reportes)',
        sin_factura, sin_producto;
    END IF;

    ALTER TABLE faltantes RENAME COLUMN factura_id TO factura_vieja_id;
    ALTER TABLE faltantes RENAME COLUMN producto_id TO producto_viejo_id;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_faltantes_factura_propia ON faltantes (factura_propia_id);
CREATE INDEX IF NOT EXISTS idx_faltantes_producto_propio ON faltantes (producto_propio_id);

-- 2 ─────────────────────────────────────────────────────────────────────────
ALTER TABLE facturas_reimpresion
  ADD COLUMN IF NOT EXISTS factura_propia_id INTEGER REFERENCES factura(id);

DO $$
DECLARE
  sin_factura INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'facturas_reimpresion' AND column_name = 'factura_id') THEN

    UPDATE facturas_reimpresion r
       SET factura_propia_id = fa.factura_propia_id
      FROM facturas fa
     WHERE fa.id = r.factura_id
       AND r.factura_propia_id IS NULL;

    SELECT COUNT(*) INTO sin_factura FROM facturas_reimpresion WHERE factura_propia_id IS NULL;
    IF sin_factura > 0 THEN
      RAISE NOTICE 'facturas_reimpresion sin enlazar: % (quedan fuera de Impresión)', sin_factura;
    END IF;

    ALTER TABLE facturas_reimpresion RENAME COLUMN factura_id TO factura_vieja_id;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_facturas_reimpresion_factura_propia
  ON facturas_reimpresion (factura_propia_id);

-- 4 ─────────────────────────────────────────────────────────────────────────
-- VOLVER A ENLAZAR, las veces que se corra. Agregado el 2026-10-10.
--
-- Los dos bloques de arriba enlazan UNA sola vez: después renombran la
-- columna vieja y su condición ("existe `factura_id`") no se cumple nunca
-- más. En una base armada desde cero eso pasa demasiado temprano: esta
-- migración corre apenas se restaura la copia de producción, cuando todavía
-- no hay ni una factura ni un producto propios, así que enlaza cero filas, y
-- al repetirla después de las cargas ya no hace nada.
--
-- Medido el 2026-10-09 en el ensayo con datos de producción: los 286
-- faltantes y las 1.571 filas de la cola de impresión quedaron sin factura
-- propia. Reporte de Clientes, Reporte de Proveedores e Impresión salían
-- vacíos. Habría pasado igual el día del corte.
--
-- Son las mismas reglas de arriba, con el nombre que las columnas tienen
-- después del cambio. Solo llenan lo que está vacío.
UPDATE faltantes f
   SET factura_propia_id = fa.factura_propia_id
  FROM facturas fa
 WHERE fa.id = f.factura_vieja_id
   AND f.factura_propia_id IS NULL
   AND fa.factura_propia_id IS NOT NULL;

UPDATE faltantes f
   SET producto_propio_id = pr.id
  FROM productos p
  JOIN producto pr ON pr.alegra_id = p.alegra_id::text
 WHERE p.id = f.producto_viejo_id
   AND f.producto_propio_id IS NULL;

UPDATE faltantes f
   SET producto_propio_id = (SELECT pr.id FROM producto pr WHERE pr.referencia = p.codigo)
  FROM productos p
 WHERE p.id = f.producto_viejo_id
   AND f.producto_propio_id IS NULL
   AND p.codigo IS NOT NULL
   AND (SELECT COUNT(*) FROM producto pr WHERE pr.referencia = p.codigo) = 1;

UPDATE facturas_reimpresion r
   SET factura_propia_id = fa.factura_propia_id
  FROM facturas fa
 WHERE fa.id = r.factura_vieja_id
   AND r.factura_propia_id IS NULL
   AND fa.factura_propia_id IS NOT NULL;
