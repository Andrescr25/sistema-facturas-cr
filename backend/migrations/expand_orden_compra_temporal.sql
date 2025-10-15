-- Migración para expandir orden_compra_temporal
-- Agrega soporte para productos eliminados y agregados

-- Agregar columna para tipo de acción
ALTER TABLE orden_compra_temporal 
ADD COLUMN IF NOT EXISTS accion VARCHAR(20) DEFAULT 'modificado';

-- Actualizar registros existentes
UPDATE orden_compra_temporal 
SET accion = 'modificado' 
WHERE accion IS NULL;

-- Agregar comentarios
COMMENT ON COLUMN orden_compra_temporal.accion IS 'Tipo de acción: modificado, eliminado, agregado';
COMMENT ON COLUMN orden_compra_temporal.producto_nombre IS 'Nombre del producto (requerido para productos agregados)';

-- Crear índice para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_orden_compra_accion ON orden_compra_temporal(accion);

-- Nota: La columna producto_nombre ya existe en la tabla

