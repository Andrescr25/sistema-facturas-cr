/**
 * Lo que impide tocar una factura ya emitida, en piezas que comparten Editar
 * (`facturaPropia.service`, `revisarSiSePuedeTocar`) y Cambiar el descuento de
 * una línea (`descuentoLinea.service`, 2026-11-11). Una sola copia de cada
 * regla: si cambia, cambia para los dos.
 */
const { httpError } = require('../../utils/validacion');

/** Lo que Hacienda ya tiene —aceptado o esperando respuesta— no se toca. */
function exigirFueraDeHacienda(factura, accion) {
  if (factura.electronica) {
    throw httpError(409,
      `La factura ${factura.numero} se emitió como electrónica: ante Hacienda ya existe y no se puede ${accion}. ` +
      'Se corrige con una nota de crédito.');
  }
  if (['pendiente', 'enviada'].includes(factura.hacienda_estado)) {
    throw httpError(409, 'La factura está reservada ante Hacienda. Consulte el resultado antes de editar o anular.');
  }
}

// SOLO LO VIGENTE. Un cobro anulado y una nota anulada siguen en su tabla —no
// se borran, por el rastro—: es la misma regla del saldo (saldo.sql.js).
async function cobradoDe(db, facturaId) {
  const { rows: [r] } = await db.query(
    `SELECT COALESCE(SUM(pf.monto), 0) AS total
       FROM pago_factura pf JOIN pago p ON p.id = pf.pago_id
      WHERE pf.factura_id = $1 AND p.anulado = FALSE`, [facturaId]);
  return Number(r.total) || 0;
}

async function acreditadoDe(db, facturaId) {
  const { rows: [r] } = await db.query(
    `SELECT COALESCE(SUM(nf.monto), 0) AS total
       FROM nota_credito_factura nf JOIN nota_credito nc ON nc.id = nf.nota_credito_id
      WHERE nf.factura_id = $1 AND nc.estado <> 'anulada'`, [facturaId]);
  return Number(r.total) || 0;
}

module.exports = { exigirFueraDeHacienda, cobradoDe, acreditadoDe };
