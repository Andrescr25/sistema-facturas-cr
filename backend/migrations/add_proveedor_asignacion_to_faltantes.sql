-- Agregar columnas para almacenar la asignación de proveedor en faltantes
-- Esto evita recalcular cada vez que se carga el reporte

ALTER TABLE faltantes 
ADD COLUMN IF NOT EXISTS proveedor_asignado VARCHAR(255),
ADD COLUMN IF NOT EXISTS proveedor_cedula VARCHAR(50),
ADD COLUMN IF NOT EXISTS precio_asignado DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS asignacion_tipo VARCHAR(20) DEFAULT 'automatica' CHECK (asignacion_tipo IN ('automatica', 'manual')),
ADD COLUMN IF NOT EXISTS fecha_asignacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS mapping_id UUID; -- Referencia al mapping usado

-- Crear índice para mejorar performance de búsquedas
CREATE INDEX IF NOT EXISTS idx_faltantes_proveedor ON faltantes(proveedor_asignado);
CREATE INDEX IF NOT EXISTS idx_faltantes_asignacion_tipo ON faltantes(asignacion_tipo);
CREATE INDEX IF NOT EXISTS idx_faltantes_mapping_id ON faltantes(mapping_id);

COMMENT ON COLUMN faltantes.proveedor_asignado IS 'Nombre del proveedor asignado (automático o manual)';
COMMENT ON COLUMN faltantes.proveedor_cedula IS 'Cédula del proveedor asignado';
COMMENT ON COLUMN faltantes.precio_asignado IS 'Precio del producto con este proveedor';
COMMENT ON COLUMN faltantes.asignacion_tipo IS 'Tipo de asignación: automatica (por precio más bajo) o manual (usuario)';
COMMENT ON COLUMN faltantes.fecha_asignacion IS 'Fecha en que se hizo la asignación';
COMMENT ON COLUMN faltantes.mapping_id IS 'ID del mapping en supplier_product_mapping';

