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

module.exports = {
  saveAdjustment,
  deleteAdjustment
};
