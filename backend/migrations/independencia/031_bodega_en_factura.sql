-- Rama independencia-alegra — 031: Facturas en Bodega sobre la factura propia
-- (sección 11 del checklist, paso 1).
--
-- 1. EL ESTADO DE ALISTADO VIVE EN `factura`, por su id. Antes vivía en la
--    tabla vieja `facturas`, buscado por `alegra_id`: una factura propia no
--    tiene id de Alegra.
--
-- 2. EL PUENTE CON LA TABLA VIEJA. Faltantes, el Reporte de Proveedores, la
--    cola de impresión y la línea de tiempo del portal todavía leen
--    `facturas` (pasos 2 y 3 de la sección). Cada factura propia queda
--    enlazada a su fila vieja por `facturas.factura_propia_id`, y Bodega
--    escribe en las dos hasta que esos módulos lean `factura`.
--
-- 3. `facturas.alegra_id` DEJA DE SER OBLIGATORIO. La copia de cada factura
--    propia entraba con alegra_id = 0, y la columna es ÚNICA: la primera
--    factura propia entraba y la SEGUNDA chocaba contra ella — no se podía
--    facturar dos veces. (No saltó porque la copia local no tiene facturas
--    propias todavía.) Muchos NULL sí caben en una columna única.

-- 1 ─────────────────────────────────────────────────────────────────────────
ALTER TABLE factura
  ADD COLUMN IF NOT EXISTS estado_bodega VARCHAR(12) NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS bodega_procesado_en TIMESTAMP,
  ADD COLUMN IF NOT EXISTS bodega_observaciones TEXT;

DO $$
BEGIN
  ALTER TABLE factura ADD CONSTRAINT factura_estado_bodega_check
    CHECK (estado_bodega IN ('pendiente', 'procesado'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Lo que Bodega busca: las emitidas de una ventana de días, lo más nuevo primero.
CREATE INDEX IF NOT EXISTS idx_factura_bodega
  ON factura (fecha DESC, id DESC) WHERE estado = 'emitida';

-- 2 y 3 ─────────────────────────────────────────────────────────────────────
ALTER TABLE facturas ALTER COLUMN alegra_id DROP NOT NULL;

ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS factura_propia_id INTEGER REFERENCES factura(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS facturas_factura_propia_id_key
  ON facturas (factura_propia_id) WHERE factura_propia_id IS NOT NULL;

-- Las copias con alegra_id = 0 (facturas propias guardadas antes de esta
-- migración) pasan a NULL y se enlazan por número.
UPDATE facturas fa
   SET alegra_id = NULL,
       factura_propia_id = f.id
  FROM factura f
 WHERE fa.alegra_id = 0
   AND f.alegra_id IS NULL
   AND f.numero = fa.numero_factura
   AND fa.factura_propia_id IS NULL;
UPDATE facturas SET alegra_id = NULL WHERE alegra_id = 0;

-- Las facturas de Alegra cargadas en `factura` se enlazan a su fila vieja por
-- el id de Alegra, que en las dos es la identidad real de la factura.
UPDATE facturas fa
   SET factura_propia_id = f.id
  FROM factura f
 WHERE f.alegra_id IS NOT NULL
   AND fa.alegra_id::text = f.alegra_id
   AND fa.factura_propia_id IS NULL;

-- Lo que Bodega ya había despachado, a la factura propia.
UPDATE factura f
   SET estado_bodega = 'procesado',
       bodega_procesado_en = fa.bodega_procesado_en,
       bodega_observaciones = fa.observaciones_adicionales
  FROM facturas fa
 WHERE fa.factura_propia_id = f.id
   AND fa.estado_bodega = 'procesado';
