/**
 * Cambiar SOLO el descuento de una línea de una factura ya emitida (2026-11-11).
 *
 * El usuario: «agregar en facturas la posibilidad de aplicar descuento a un
 * producto específico desde factura, que no me deje modificar cantidad ni
 * nada, pero sí editar el descuento».
 *
 * POR QUÉ NO ES «EDITAR FACTURA». Editar reemplaza las líneas enteras y por
 * eso no se puede si Bodega ya tomó la factura (2026-10-23) ni si tiene un
 * cobro. Acá la cantidad, el producto y el precio no se tocan: no cambia lo que
 * Bodega despachó ni el inventario (el kardex sigue la cantidad), así que SÍ se
 * puede con la factura en Bodega. Un cobro parcial tampoco estorba: el saldo se
 * calcula, y solo se frena si lo ya cobrado pasa del total nuevo.
 *
 * LO QUE SIGUE IGUAL QUE AL EDITAR:
 *   · electrónica o reservada ante Hacienda, no: se corrige con nota de crédito;
 *   · con una nota de crédito vigente, no: la nota se calculó con el
 *     descuento de antes (`notaCredito.service`, decisión 1);
 *   · hace falta el permiso «Cambiar precio y descuento» (lo mira el
 *     controlador, `precio-factura`).
 *
 * La línea se recalcula con la fórmula de siempre (`montosDeLinea`), con SU
 * precio y SU tarifa —los del día que se facturó—, y los totales de la factura
 * son la suma de sus líneas. Impresión, que después puede reajustar la factura
 * por faltantes, conserva el descuento de cada línea.
 */
const { pool } = require('../../../config/database');
const { enTransaccion } = require('../../utils/transaccion');
const { httpError, idValido } = require('../../utils/validacion');
const { registrarCambio } = require('../../utils/bitacora');
const { montosDeLinea, dinero, enColones, recortar } = require('./facturaLineas');
const { exigirFueraDeHacienda, cobradoDe, acreditadoDe } = require('./candadosFactura');

/** El porcentaje pedido: de 0 a 100, a centésimas. */
function porcentajeValido(valor) {
  const n = typeof valor === 'string' && valor.trim() === '' ? NaN : Number(valor);
  if (valor === null || valor === undefined || !Number.isFinite(n) || n < 0 || n > 100) {
    throw httpError(400, 'El descuento va de 0 a 100 %.');
  }
  return Math.round(n * 100) / 100;
}

async function cambiarDescuentoDeLinea(facturaId, numeroLinea, datos = {}, usuarioId = null) {
  const id = idValido(facturaId);
  const numero = idValido(numeroLinea);
  const porcentaje = porcentajeValido(datos.descuentoPorcentaje);

  return enTransaccion(pool, async (c) => {
    const { rows: [f] } = await c.query('SELECT * FROM factura WHERE id = $1 FOR UPDATE', [id]);
    if (!f) throw httpError(404, 'No existe esa factura.');
    if (f.estado === 'anulada') throw httpError(409, `La factura ${f.numero} está anulada.`);
    if (f.estado !== 'emitida') throw httpError(409, `La factura ${f.numero} todavía es un borrador.`);
    if (f.alegra_id) throw httpError(409, `La factura ${f.numero} es de las de Alegra: se corrige con una nota de crédito.`);
    exigirFueraDeHacienda(f, 'cambiarle el descuento');

    const acreditado = await acreditadoDe(c, id);
    if (acreditado > 0) {
      throw httpError(409,
        `La factura ${f.numero} tiene una nota de crédito por ${enColones(acreditado)}, calculada con el descuento ` +
        'de hoy: para cambiarlo, primero hay que anular esa nota.');
    }

    const { rows: [l] } = await c.query(
      'SELECT * FROM factura_linea WHERE factura_id = $1 AND numero_linea = $2 FOR UPDATE', [id, numero]);
    if (!l) throw httpError(404, 'Esa línea no está en la factura.');

    const antes = Number(l.descuento_porcentaje) || 0;
    if (antes === porcentaje) return { id, numero: f.numero, total: Number(f.total), sinCambios: true };

    const m = montosDeLinea({
      cantidad: Number(l.cantidad), precio: Number(l.precio_unitario), porcentaje, tarifa: Number(l.tarifa) || 0
    });
    await c.query(
      `UPDATE factura_linea SET descuento_porcentaje = $2, descuento_monto = $3, impuesto_monto = $4, total = $5
        WHERE id = $1`,
      [l.id, porcentaje, m.descuentoMonto, m.impuestoMonto, m.total]);

    // La factura suma sus líneas: base = total − impuesto de cada una.
    const { rows: [t] } = await c.query(
      `SELECT COALESCE(SUM(total - impuesto_monto), 0) AS subtotal, COALESCE(SUM(descuento_monto), 0) AS descuento,
              COALESCE(SUM(impuesto_monto), 0) AS impuesto
         FROM factura_linea WHERE factura_id = $1`, [id]);
    const subtotal = dinero(t.subtotal);
    const impuesto = dinero(t.impuesto);
    const total = dinero(subtotal + impuesto);

    const cobrado = await cobradoDe(c, id);
    if (cobrado > total) {
      throw httpError(409,
        `A la factura ${f.numero} ya le cobraron ${enColones(cobrado)}: con este descuento quedaría en ` +
        `${enColones(total)} y se habría cobrado de más. Primero hay que anular el cobro (abajo, en «Cobros»).`);
    }

    // `saldo` es la columna vieja que Editar también mantiene; lo que se debe
    // se sigue calculando al leer (total − cobros − notas).
    await c.query(
      `UPDATE factura SET subtotal = $2, descuento = $3, impuesto = $4, total = $5, saldo = $6,
              actualizado_en = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [id, subtotal, dinero(t.descuento), impuesto, total, dinero(total - cobrado)]);

    await registrarCambio(c, {
      entidad: 'factura', entidadId: id, accion: 'editar',
      antes: { [`descuento de ${l.nombre}`]: antes, total: Number(f.total) },
      despues: { [`descuento de ${l.nombre}`]: porcentaje, total },
      usuarioId,
      motivo: recortar(datos.motivo, 2000) || `Descuento de la línea ${numero}`
    });

    return { id, numero: f.numero, total, linea: { numeroLinea: numero, descuentoPorcentaje: porcentaje, total: m.total } };
  });
}

module.exports = { cambiarDescuentoDeLinea, porcentajeValido };
