/**
 * Missing-Items Module - Service
 * Lógica de negocio para operaciones de faltantes
 */

const { pool } = require('../../../config/database');
const { AHORA_CR_SQL } = require('../../utils/fechaCR');
const { enTransaccion } = require('../../utils/transaccion');
const { httpError, idValido } = require('../../utils/validacion');
const { validarEntrega } = require('./ajusteEntrega');
const { asignarIngreso, soltarIngreso } = require('./ingresoFaltante');

/**
 * Guardar/borrar comparte el bloqueo de factura con encolar/procesar.
 * Bloquear solo el ajuste deja que una respuesta tardía cambie lo que
 * Impresión ya recibió. El orden factura → faltante evita bloqueos cruzados.
 */
async function conFaltanteEditable(idCrudo, trabajo) {
  const id = idValido(idCrudo);
  return enTransaccion(pool, async c => {
    const { rows: [vinculo] } = await c.query('SELECT factura_propia_id FROM faltantes WHERE id=$1', [id]);
    if (!vinculo) throw httpError(404, 'Ese faltante no existe.');
    if (!vinculo.factura_propia_id) throw httpError(409, 'El faltante no tiene una factura propia vinculada.');
    const facturaId = vinculo.factura_propia_id;
    const { rows: [factura] } = await c.query('SELECT id,estado FROM factura WHERE id=$1 FOR UPDATE', [facturaId]);
    if (!factura) throw httpError(404, 'La factura del faltante no existe.');
    if (factura.estado === 'anulada') throw httpError(409, 'Una factura anulada no admite ajustes de entrega.');
    const { rows: [faltante] } = await c.query(`SELECT id,cantidad_faltante,tipo_faltante,estado,producto_propio_id FROM faltantes
      WHERE id=$1 AND factura_propia_id=$2 FOR UPDATE`, [id, facturaId]);
    if (!faltante) throw httpError(409, 'El faltante cambió; recargue el reporte.');
    if (faltante.estado !== 'pendiente') throw httpError(409, 'Recupere la factura en Reporte de Clientes antes de cambiar la entrega.');
    if (faltante.tipo_faltante === 'completo' || Number(faltante.cantidad_faltante) <= 0) {
      throw httpError(409, 'Ese producto no tiene un faltante pendiente.');
    }
    const { rowCount } = await c.query(`SELECT 1 FROM facturas_reimpresion
      WHERE factura_propia_id=$1 AND estado='pendiente' LIMIT 1`, [facturaId]);
    if (rowCount) throw httpError(409, 'La factura está en Impresión. Recupérela en Reporte de Clientes antes de cambiar la entrega.');
    return trabajo(c, faltante);
  });
}

/**
 * Guarda o actualiza un ajuste de faltante
 */
async function saveAdjustment({ faltanteId, cantidadEntregada, estado, revisado }, usuarioId = null) {
  return conFaltanteEditable(faltanteId, async (c, faltante) => {
    const entrega = validarEntrega(faltante.cantidad_faltante, { cantidadEntregada, estado, revisado });
    // Solo se entrega lo que ingresó por Revisión de precios (2026-10-25):
    // sin compra que lo respalde, el 409 dice cuánto hay.
    await asignarIngreso(c, faltante, entrega.cantidad, usuarioId);
    // La bandera del cliente puede quedar vieja: deriva de la entrega real.
    await c.query(`
    INSERT INTO faltantes_ajustes (faltante_id, cantidad_entregada, estado, requiere_actualizacion, revisado)
    VALUES ($1, $2, $3, $4, COALESCE($5, FALSE))
    ON CONFLICT (faltante_id) 
    DO UPDATE SET 
      cantidad_entregada = $2,
      estado = $3,
      requiere_actualizacion = $4,
      revisado = COALESCE($5, CASE
        WHEN faltantes_ajustes.cantidad_entregada <> $2 OR faltantes_ajustes.estado <> $3 THEN FALSE
        ELSE faltantes_ajustes.revisado END),
      updated_at = ${AHORA_CR_SQL}
    `, [faltante.id, entrega.cantidad, entrega.estado, entrega.requiereActualizacion, entrega.revisado ?? null]);

    return { success: true, message: 'Ajuste guardado' };
  });
}

/**
 * Elimina un ajuste de faltante
 */
async function deleteAdjustment(faltanteId) {
  return conFaltanteEditable(faltanteId, async (c, faltante) => {
    await soltarIngreso(c, faltante.id);
    await c.query('DELETE FROM faltantes_ajustes WHERE faltante_id = $1', [faltante.id]);

    return { success: true, message: 'Ajuste eliminado' };
  });
}

module.exports = {
  saveAdjustment,
  deleteAdjustment
};
