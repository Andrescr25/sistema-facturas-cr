-- ========================================
-- LIMPIAR ESPACIOS EN NOMBRES DE PROVEEDORES
-- ========================================
-- Este script elimina espacios en blanco al inicio/final de nombres de proveedores
-- en todas las tablas del sistema

BEGIN;

-- 1. LIMPIAR FACTURAS DE PROVEEDORES
UPDATE facturas_proveedores
SET proveedor_nombre = TRIM(proveedor_nombre)
WHERE proveedor_nombre != TRIM(proveedor_nombre);

-- 2. LIMPIAR MAPPINGS
UPDATE supplier_product_mapping
SET supplier_name = TRIM(supplier_name)
WHERE supplier_name != TRIM(supplier_name);

-- 3. LIMPIAR FALTANTES
UPDATE faltantes
SET proveedor_asignado = TRIM(proveedor_asignado)
WHERE proveedor_asignado IS NOT NULL 
  AND proveedor_asignado != TRIM(proveedor_asignado);

-- 4. MOSTRAR RESULTADOS
DO $$
DECLARE
  facturas_actualizadas INTEGER;
  mappings_actualizados INTEGER;
  faltantes_actualizados INTEGER;
BEGIN
  SELECT COUNT(*) INTO facturas_actualizadas
  FROM facturas_proveedores
  WHERE proveedor_nombre = TRIM(proveedor_nombre);
  
  SELECT COUNT(*) INTO mappings_actualizados
  FROM supplier_product_mapping
  WHERE supplier_name = TRIM(supplier_name);
  
  SELECT COUNT(*) INTO faltantes_actualizados
  FROM faltantes
  WHERE proveedor_asignado IS NULL 
     OR proveedor_asignado = TRIM(proveedor_asignado);
  
  RAISE NOTICE '✅ Limpieza completada:';
  RAISE NOTICE '   - Facturas limpias: %', facturas_actualizadas;
  RAISE NOTICE '   - Mappings limpios: %', mappings_actualizados;
  RAISE NOTICE '   - Faltantes limpios: %', faltantes_actualizados;
END $$;

COMMIT;

