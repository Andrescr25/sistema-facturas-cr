/**
 * Las ventas netas de un empleado en un rango de días (E3 de la planilla,
 * 2026-10-30): la base de su comisión.
 *
 * El usuario: «2 % de ventas netas», y decidió «sin IVA, menos devoluciones».
 * · Ventas: `factura.subtotal` (sin IVA, después de descuentos) de las que hizo
 *   él (`creado_por`; la que armó sin señal también es suya), emitidas.
 * · Devoluciones: lo que acredita una nota vigente sobre esas facturas, sin
 *   IVA: el monto aplicado (con IVA) × subtotal / total de la nota. Resta en
 *   el mes de la NOTA, aunque la factura sea de otro mes.
 * · Solo desde que es empleado (`empleado.desde`): lo de antes no le comisiona.
 */
const { query } = require('../../../config/database');
const { dinero } = require('./liquidacion');

async function ventasNetas(usuarioId, { desde, hasta }, desdeFicha) {
  const { rows: [v] } = await query(
    `SELECT COALESCE(SUM(f.subtotal), 0) AS ventas, COUNT(*)::int AS facturas
       FROM factura f
      WHERE f.creado_por = $1 AND f.estado = 'emitida' AND f.fecha BETWEEN $2::date AND $3::date AND f.fecha >= $4::date`,
    [usuarioId, desde, hasta, desdeFicha]);
  const { rows: [d] } = await query(
    `SELECT COALESCE(SUM(CASE WHEN nc.total > 0 THEN nf.monto * nc.subtotal / nc.total ELSE 0 END), 0) AS devoluciones,
            COUNT(DISTINCT nc.id)::int AS notas
       FROM nota_credito_factura nf
       JOIN nota_credito nc ON nc.id = nf.nota_credito_id
       JOIN factura f ON f.id = nf.factura_id
      WHERE f.creado_por = $1 AND f.estado = 'emitida' AND f.fecha >= $4::date
        AND nc.estado <> 'anulada' AND nc.fecha BETWEEN $2::date AND $3::date`,
    [usuarioId, desde, hasta, desdeFicha]);
  const ventas = dinero(v.ventas), devoluciones = dinero(d.devoluciones);
  return { ventas, facturas: v.facturas, devoluciones, notas: d.notas, netas: dinero(ventas - devoluciones) };
}

module.exports = { ventasNetas };
