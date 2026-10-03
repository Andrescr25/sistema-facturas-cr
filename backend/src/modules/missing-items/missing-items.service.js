/**
 * Missing-Items Module - Service
 * Lógica de negocio para operaciones de faltantes
 */

const { query } = require('../../../config/database');
const { AHORA_CR_SQL } = require('../../utils/fechaCR');

/**
 * Guarda o actualiza un ajuste de faltante
 */
async function saveAdjustment({ faltanteId, cantidadEntregada, estado, requiereActualizacion, revisado }) {
  await query(`
    INSERT INTO faltantes_ajustes (faltante_id, cantidad_entregada, estado, requiere_actualizacion, revisado)
    VALUES ($1, $2, $3, $4, COALESCE($5, FALSE))
    ON CONFLICT (faltante_id) 
    DO UPDATE SET 
      cantidad_entregada = $2,
      estado = $3,
      requiere_actualizacion = $4,
      revisado = COALESCE($5, faltantes_ajustes.revisado),
      updated_at = ${AHORA_CR_SQL}
  `, [faltanteId, cantidadEntregada, estado, requiereActualizacion, revisado ?? null]);

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
    WHERE codigo = $1 OR alegra_id::text = $1 OR nombre ILIKE $2
    LIMIT 5
  `, [alegraReference, `%${alegraReference}%`]);

  // Buscar faltantes asociados
  const faltantes = await query(`
    SELECT f.*, fa.numero AS numero_factura, fa.cliente_nombre
    FROM faltantes f
    JOIN factura fa ON fa.id = f.factura_propia_id
    JOIN producto p ON p.id = f.producto_propio_id
    WHERE p.referencia = $1 OR p.alegra_id = $1 OR p.nombre ILIKE $2
    ORDER BY f.created_at DESC
    LIMIT 10
  `, [alegraReference, `%${alegraReference}%`]);

  // Buscar mappings de proveedor
  const mappings = await query(`
    SELECT spm.*
    FROM supplier_product_mapping spm
    WHERE spm.supplier_code = $1 OR spm.alegra_reference = $1 OR spm.alegra_name ILIKE $2
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

module.exports = {
  saveAdjustment,
  deleteAdjustment,
  cleanProviderMissingItems,
  getDiagnostic
};
