-- Migración: Agregar 'completo' como tipo_faltante válido
-- Permite persistir el estado de productos que llegaron completos

-- 1. Eliminar constraint existente
ALTER TABLE faltantes DROP CONSTRAINT IF EXISTS faltantes_tipo_faltante_check;

-- 2. Agregar nuevo constraint con 'completo'
ALTER TABLE faltantes ADD CONSTRAINT faltantes_tipo_faltante_check 
  CHECK (tipo_faltante IN ('total', 'parcial', 'completo'));

-- 3. Permitir cantidad_faltante = 0 (para productos completos)
ALTER TABLE faltantes ALTER COLUMN cantidad_faltante SET DEFAULT 0;

-- Verificar
SELECT constraint_name FROM information_schema.table_constraints 
WHERE table_name = 'faltantes' AND constraint_type = 'CHECK';
