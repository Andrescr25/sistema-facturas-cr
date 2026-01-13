-- Agregar columna descripcion_factura a la tabla faltantes
ALTER TABLE faltantes ADD COLUMN IF NOT EXISTS descripcion_factura TEXT;
