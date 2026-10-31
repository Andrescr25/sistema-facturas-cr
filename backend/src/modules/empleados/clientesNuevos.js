/**
 * Los clientes que consiguió el empleado (E2 de la planilla, 2026-10-30).
 *
 * El usuario: ₡2.000 «por cliente nuevo que consiga», y cuenta CON SU PRIMERA
 * COMPRA. Son los que registró desde Preventa (`cliente.captado_por`,
 * migración 073). La primera compra es su factura vigente más vieja (emitida y
 * no acreditada entera, la misma regla del saldo), sea quien sea quien la
 * hizo; cuenta en la quincena de esa fecha. Si ya había comprado antes de que
 * lo registrara, no era nuevo y no cuenta nunca.
 */
const { query } = require('../../../config/database');
const { SIN_CREDITO_TOTAL } = require('../facturacion/saldo.sql');

const PRIMERA_COMPRA = `(SELECT MIN(f.fecha) FROM factura f WHERE f.cliente_id = c.id AND f.estado = 'emitida' AND ${SIN_CREDITO_TOTAL})`;

/**
 * @returns {{cuentan: object[], esperando: object[]}} los que compraron por
 *   primera vez entre `desde` y `hasta`, y los que todavía no compran
 */
async function clientesNuevos(usuarioId, { desde, hasta }) {
  const { rows } = await query(
    `SELECT id, nombre, ruta, captado_dia, to_char(primera, 'YYYY-MM-DD') AS primera_compra
       FROM (SELECT c.id, c.nombre, r.nombre AS ruta, ${PRIMERA_COMPRA} AS primera,
                    to_char(c.captado_en AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM-DD') AS captado_dia
               FROM cliente c LEFT JOIN ruta_cliente r ON r.id = c.ruta_id
              WHERE c.captado_por = $1) x
      WHERE (primera BETWEEN $2::date AND $3::date AND primera >= captado_dia::date) OR primera IS NULL
      ORDER BY primera NULLS LAST, captado_dia, id`, [usuarioId, desde, hasta]);
  const comoCliente = (f) => ({ id: f.id, nombre: f.nombre, ruta: f.ruta, captado: f.captado_dia, primeraCompra: f.primera_compra });
  return { cuentan: rows.filter(f => f.primera_compra).map(comoCliente), esperando: rows.filter(f => !f.primera_compra).map(comoCliente) };
}

module.exports = { clientesNuevos };
