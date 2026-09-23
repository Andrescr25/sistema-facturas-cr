/**
 * Caja General: todo lo que entró y salió, con las facturas que lo originaron.
 *
 * Decisión del usuario (2026-09-23): Caja General es el punto central, sin
 * fondo fijo ni cajas separadas. Cada cobro a un cliente ENTRA (y el saldo de
 * sus facturas baja, porque se calcula); cada pago a un proveedor o de un
 * gasto SALE. Los movimientos se leen de la vista `movimiento_caja`
 * (migración 027), armada sobre los mismos documentos: un cobro no puede
 * aparecer dos veces ni quedar en la caja después de anulado.
 *
 * POR PERÍODO, NO UN SALDO DE SIEMPRE. El histórico copiado de Alegra tiene
 * ₡212 millones de cobros y casi ninguna salida registrada: los pagos a
 * proveedores de antes se marcaban "pagada" a mano, sin movimiento. Un saldo
 * acumulado desde el principio sumaría todo lo que entró y nada de lo que
 * salió — un número que no existe en ningún lado. Lo que sí es cierto es lo
 * que entró y salió en un período.
 */

const { pool } = require('../../../config/database');
const { httpError } = require('../../utils/validacion');
const { hoyEnCostaRica } = require('../../utils/fechaCR');

const dinero = (v) => Math.round((Number(v) || 0) * 100) / 100;
const num = (v) => Number(v) || 0;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {string} [filtros.desde]  YYYY-MM-DD; por omisión, el primero del mes (Costa Rica)
 * @param {string} [filtros.hasta]  YYYY-MM-DD; por omisión, hoy (Costa Rica)
 */
async function movimientos({ desde, hasta } = {}) {
  const hoy = hoyEnCostaRica();
  const d = desde ? String(desde).slice(0, 10) : `${hoy.slice(0, 8)}01`;
  const h = hasta ? String(hasta).slice(0, 10) : hoy;
  if (!FECHA.test(d) || !FECHA.test(h)) throw httpError(400, 'Las fechas van como AAAA-MM-DD.');
  if (d > h) throw httpError(400, 'La fecha de inicio es posterior a la de fin.');

  const { rows } = await pool.query(
    `SELECT tipo, sentido, documento_id, fecha, monto, contraparte, metodo, metodo_clave,
            referencia, anulado, motivo_anulacion, facturas
       FROM movimiento_caja
      WHERE fecha BETWEEN $1::date AND $2::date
      ORDER BY fecha DESC, creado_en DESC NULLS LAST`,
    [d, h]
  );

  let entradas = 0;
  let salidas = 0;
  const porMetodo = new Map();
  for (const r of rows) {
    if (r.anulado) continue;
    const monto = num(r.monto);
    if (r.sentido === 'entrada') entradas += monto; else salidas += monto;
    const clave = r.metodo_clave || 'otros';
    const m = porMetodo.get(clave) || { clave, metodo: r.metodo || 'Otros', entradas: 0, salidas: 0 };
    if (r.sentido === 'entrada') m.entradas = dinero(m.entradas + monto); else m.salidas = dinero(m.salidas + monto);
    porMetodo.set(clave, m);
  }

  return {
    desde: d,
    hasta: h,
    movimientos: rows.map((r) => ({
      tipo: r.tipo,
      sentido: r.sentido,
      id: r.documento_id,
      fecha: r.fecha,
      monto: num(r.monto),
      contraparte: r.contraparte,
      metodo: r.metodo,
      referencia: r.referencia,
      anulado: r.anulado,
      motivoAnulacion: r.motivo_anulacion,
      facturas: r.facturas
    })),
    totales: {
      entradas: dinero(entradas),
      salidas: dinero(salidas),
      neto: dinero(entradas - salidas),
      cantidad: rows.filter((r) => !r.anulado).length,
      anulados: rows.filter((r) => r.anulado).length
    },
    porMetodo: [...porMetodo.values()].sort((a, b) => (b.entradas + b.salidas) - (a.entradas + a.salidas))
  };
}

module.exports = { movimientos };
