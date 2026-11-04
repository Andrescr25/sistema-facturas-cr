/**
 * Lo que cubren, factura por factura, los cheques a fecha todavía sin
 * confirmar (migración 078). Aparte del servicio de cheques porque lo leen
 * también el pago —para no pagar dos veces lo mismo— y la lista de facturas.
 */

const { pool } = require('../../../config/database');

const dinero = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** @returns {Promise<Map<string, {total: number, cheques: Array<{id, numero, fechaCobro, monto}>}>>} */
async function pendientesPorCuenta(ids, ejecutor = pool) {
  if (!ids || ids.length === 0) return new Map();
  const { rows } = await ejecutor.query(
    `SELECT cc.cuenta_por_pagar_id, cc.monto, ch.id, ch.numero, ch.fecha_cobro::text AS fecha_cobro
       FROM cheque_proveedor_cuenta cc
       JOIN cheque_proveedor ch ON ch.id = cc.cheque_id
      WHERE cc.cuenta_por_pagar_id = ANY($1::uuid[])
        AND ch.confirmado_en IS NULL AND NOT ch.anulado
      ORDER BY ch.fecha_cobro, ch.id`,
    [ids]
  );
  const porCuenta = new Map();
  for (const r of rows) {
    const cuenta = porCuenta.get(r.cuenta_por_pagar_id) || { total: 0, cheques: [] };
    cuenta.total = dinero(cuenta.total + Number(r.monto));
    cuenta.cheques.push({ id: r.id, numero: r.numero, fechaCobro: r.fecha_cobro, monto: dinero(r.monto) });
    porCuenta.set(r.cuenta_por_pagar_id, cuenta);
  }
  return porCuenta;
}

module.exports = { pendientesPorCuenta };
