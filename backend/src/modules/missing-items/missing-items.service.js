/**
 * Missing-Items Module - Service
 * Lógica de negocio para operaciones de faltantes
 */

const { query } = require('../../../config/database');

/**
 * Guarda o actualiza un ajuste de faltante
 */
async function saveAdjustment({ faltanteId, cantidadEntregada, estado, requiereActualizacion }) {
  await query(`
    INSERT INTO faltantes_ajustes (faltante_id, cantidad_entregada, estado, requiere_actualizacion)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (faltante_id) 
    DO UPDATE SET 
      cantidad_entregada = $2,
      estado = $3,
      requiere_actualizacion = $4,
      updated_at = CURRENT_TIMESTAMP
  `, [faltanteId, cantidadEntregada, estado, requiereActualizacion]);

  return { success: true, message: 'Ajuste guardado' };
}

/**
 * Elimina un ajuste de faltante
 */
async function deleteAdjustment(faltanteId) {
  await query(
    'DELETE FROM faltantes_ajustes WHERE faltante_id = $1',
    [faltanteId]
  );

  return { success: true, message: 'Ajuste eliminado' };
}

/**
 * Limpia los faltantes de proveedor de la base de datos
 */
async function cleanProviderMissingItems() {
  // Contar faltantes antes de eliminar
  const countResult = await query('SELECT COUNT(*) FROM faltantes');
  const totalAntes = parseInt(countResult.rows[0].count);

  // Eliminar todos los faltantes
  await query('DELETE FROM faltantes');

  console.log(`✅ Faltantes limpiados: ${totalAntes} registros eliminados`);

  return {
    success: true,
    message: 'Faltantes limpiados correctamente',
    registros_eliminados: totalAntes
  };
}

/**
 * Obtiene diagnóstico de un producto por su referencia de Alegra
 */
async function getDiagnostic(alegraReference) {
  console.log(`🔍 Buscando diagnóstico para ${alegraReference}...`);

  // Buscar producto en BD local
  const productoLocal = await query(`
    SELECT id, nombre, codigo, alegra_id, proveedor_id
    FROM productos
    WHERE codigo = $1 OR alegra_id = $1 OR nombre ILIKE $2
    LIMIT 5
  `, [alegraReference, `%${alegraReference}%`]);

  // Buscar faltantes asociados
  const faltantes = await query(`
    SELECT f.*, fa.numero_factura, fa.cliente_nombre
    FROM faltantes f
    JOIN facturas fa ON f.factura_id = fa.id
    JOIN productos p ON f.producto_id = p.id
    WHERE p.codigo = $1 OR p.alegra_id::text = $1 OR p.nombre ILIKE $2
    ORDER BY f.created_at DESC
    LIMIT 10
  `, [alegraReference, `%${alegraReference}%`]);

  // Buscar mappings de proveedor
  const mappings = await query(`
    SELECT spm.*, p.nombre as supplier_name
    FROM supplier_product_mapping spm
    JOIN proveedores p ON spm.supplier_id = p.id
    WHERE spm.product_code = $1 OR spm.product_name ILIKE $2
    LIMIT 10
  `, [alegraReference, `%${alegraReference}%`]);

  return {
    success: true,
    data: {
      producto_local: productoLocal.rows,
      faltantes_recientes: faltantes.rows,
      mappings_proveedor: mappings.rows
    }
  };
}

/**
 * Limpia duplicados de un producto
 */
async function cleanDuplicates(alegraReference) {
  console.log(`🧹 Limpiando duplicados para ${alegraReference}...`);

  // Encontrar productos duplicados (mismo codigo)
  const duplicados = await query(`
    WITH duplicates AS (
      SELECT id, codigo, nombre, created_at,
             ROW_NUMBER() OVER (PARTITION BY codigo ORDER BY created_at ASC) as rn
      FROM productos
      WHERE codigo = $1
    )
    SELECT * FROM duplicates WHERE rn > 1
  `, [alegraReference]);

  if (duplicados.rows.length === 0) {
    return {
      success: true,
      message: 'No se encontraron duplicados',
      eliminados: 0
    };
  }

  const idsToDelete = duplicados.rows.map(r => r.id);
  
  // Actualizar faltantes que apuntan a duplicados al producto original
  const productoOriginal = await query(`
    SELECT id FROM productos 
    WHERE codigo = $1 
    ORDER BY created_at ASC 
    LIMIT 1
  `, [alegraReference]);

  if (productoOriginal.rows.length > 0) {
    await query(`
      UPDATE faltantes 
      SET producto_id = $1 
      WHERE producto_id = ANY($2::int[])
    `, [productoOriginal.rows[0].id, idsToDelete]);
  }

  // Eliminar duplicados
  await query(`
    DELETE FROM productos WHERE id = ANY($1::int[])
  `, [idsToDelete]);

  return {
    success: true,
    message: `Duplicados eliminados: ${idsToDelete.length}`,
    eliminados: idsToDelete.length
  };
}

module.exports = {
  saveAdjustment,
  deleteAdjustment,
  cleanProviderMissingItems,
  getDiagnostic,
  cleanDuplicates
};
