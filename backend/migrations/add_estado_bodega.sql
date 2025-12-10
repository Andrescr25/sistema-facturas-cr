-- Migración: Agregar campo estado_bodega para separar estado de bodega vs estado de reporte clientes
-- Fecha: 2025-12-10
-- Descripción: Se crea un nuevo campo estado_bodega para que el estado en bodega sea independiente del estado en reporte clientes

-- 1. Agregar nueva columna estado_bodega
ALTER TABLE facturas
ADD COLUMN IF NOT EXISTS estado_bodega VARCHAR(20) DEFAULT 'pendiente'
CHECK (estado_bodega IN ('pendiente', 'procesado'));

-- 2. Copiar valores actuales de estado_procesamiento a estado_bodega
-- (para facturas que ya tienen faltantes registrados)
UPDATE facturas
SET estado_bodega = 'procesado'
WHERE id IN (
  SELECT DISTINCT factura_id
  FROM faltantes
);

-- 3. Resetear estado_procesamiento a 'pendiente' para todas las facturas
-- (ahora estado_procesamiento solo se usa para reporte clientes)
UPDATE facturas
SET estado_procesamiento = 'pendiente';

-- Verificación
SELECT
  'Total facturas' as descripcion,
  COUNT(*) as cantidad
FROM facturas
UNION ALL
SELECT
  'Con estado_bodega procesado' as descripcion,
  COUNT(*) as cantidad
FROM facturas
WHERE estado_bodega = 'procesado'
UNION ALL
SELECT
  'Con estado_procesamiento procesado' as descripcion,
  COUNT(*) as cantidad
FROM facturas
WHERE estado_procesamiento = 'procesado';
