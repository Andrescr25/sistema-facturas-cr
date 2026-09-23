/**
 * El cierre de caja del día.
 *
 * "Cobros del día" ya respondía cuánto entró. Esto responde otra cosa: si la
 * caja CUADRA. La diferencia entre las dos preguntas es la que hace aparecer
 * un faltante el mismo día y no tres semanas después, cuando ya nadie se
 * acuerda de quién estuvo en la caja.
 *
 * DECISIONES
 *
 * 1. EL DÍA ES EL DE COSTA RICA. El cálculo viejo tomaba el día en UTC
 *    (`new Date(fecha + 'T00:00:00.000Z')`), así que un cobro de las 7 de la
 *    noche caía en el reporte del día siguiente. En un cierre de caja eso no
 *    es un detalle: es plata que aparece donde no se contó.
 *
 * 2. SE COMPARA SOLO EL EFECTIVO. SINPE, transferencia y tarjeta se cuadran
 *    contra el banco, no contando billetes. Los demás métodos se guardan como
 *    referencia del día.
 *
 * 3. EL ESPERADO SE CONGELA AL CERRAR. Un cobro se puede anular después; si
 *    el esperado se recalculara al abrir un cierre viejo, la diferencia que
 *    alguien firmó cambiaría sola y el faltante del mes pasado desaparecería.
 *
 * 4. UN DÍA NO SE CIERRA DOS VECES. Reabrir se puede, con motivo, y queda
 *    anotado quién y cuándo: si el segundo conteo pudiera pisar al primero en
 *    silencio, el cierre no probaría nada.
 *
 * 5. LO QUE SALIÓ EN EFECTIVO SE RESTA (migración 026). Todo pasa por Caja
 *    General (decisión del usuario, 2026-09-23); lo que dice si la plata
 *    salió de los billetes que se cuentan es el MÉTODO. Un pago a proveedor o
 *    un gasto pagado en efectivo ya no está al contar; uno por SINPE o
 *    transferencia no toca la caja física. Se congela al cerrar, igual que el
 *    esperado. Las salidas salen de la vista `movimiento_caja` (027), la
 *    misma que muestra la pantalla de Caja General.
 */

const { pool } = require('../../../config/database');
const { registrarCambio } = require('../../utils/bitacora');
const { httpError } = require('../../utils/validacion');
const { enTransaccion: enTransaccionCon } = require('../../utils/transaccion');
const { hoyEnCostaRica } = require('../../utils/fechaCR');

const enTransaccion = (trabajo) => enTransaccionCon(pool, trabajo);
const dinero = (v) => Math.round((Number(v) || 0) * 100) / 100;
const num = (v) => Number(v) || 0;

const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;


function diaValido(fecha) {
  const dia = fecha ? String(fecha).slice(0, 10) : hoyEnCostaRica();
  if (!FECHA_VALIDA.test(dia)) throw httpError(400, 'La fecha va como AAAA-MM-DD.');
  return dia;
}

/**
 * Lo que salió de la caja EN EFECTIVO en un día: pagos a proveedores y gastos
 * vigentes, con las facturas que cubrieron.
 */
async function salidasDeCaja(ejecutor, dia) {
  const { rows } = await ejecutor.query(
    `SELECT tipo, documento_id, contraparte, monto, facturas
       FROM movimiento_caja
      WHERE sentido = 'salida' AND fecha = $1::date AND anulado = FALSE AND metodo_clave = 'efectivo'
      ORDER BY tipo, documento_id`,
    [dia]
  );
  const salidas = rows.map(r => ({
    tipo: r.tipo === 'pago_proveedor' ? 'proveedor' : r.tipo,
    id: r.documento_id, descripcion: r.contraparte, facturas: r.facturas, monto: num(r.monto)
  }));
  return { salidas, total: dinero(salidas.reduce((s, r) => s + r.monto, 0)) };
}

/**
 * Lo cobrado en un día, por método.
 *
 * Los cobros ANULADOS no cuentan: esa plata no entró. Se devuelven aparte
 * para que se vean, porque alguien va a preguntar por ellos.
 */
async function resumenDelDia(fecha) {
  const dia = diaValido(fecha);

  const { rows } = await pool.query(
    `SELECT p.id, p.fecha, p.cliente_nombre, p.metodo_pago_id, p.metodo_pago_texto,
            p.referencia, p.monto, p.anulado, p.motivo_anulacion,
            mp.clave AS metodo_clave, mp.nombre AS metodo_nombre,
            (SELECT string_agg(f.numero, ', ')
               FROM pago_factura pf JOIN factura f ON f.id = pf.factura_id
              WHERE pf.pago_id = p.id) AS facturas
       FROM pago p
       LEFT JOIN metodo_pago mp ON mp.id = p.metodo_pago_id
      WHERE p.fecha = $1::date
      ORDER BY p.id`,
    [dia]
  );

  const vigentes = rows.filter(r => !r.anulado);
  const porMetodo = new Map();
  for (const r of vigentes) {
    const clave = r.metodo_clave || (r.metodo_pago_texto || 'otros').toLowerCase();
    // El nombre del catálogo antes que el texto copiado: las 1.350 facturas
    // traídas de Alegra guardan "CASH", y eso no se le muestra a nadie.
    const nombre = r.metodo_nombre || r.metodo_pago_texto || 'Otros';
    const actual = porMetodo.get(clave) || { metodo: nombre, clave, monto: 0, cantidad: 0 };
    actual.monto = dinero(actual.monto + num(r.monto));
    actual.cantidad += 1;
    porMetodo.set(clave, actual);
  }

  const cobros = rows.map(r => ({
    id: r.id, fecha: r.fecha, cliente: r.cliente_nombre,
    metodo: r.metodo_nombre || r.metodo_pago_texto, metodoClave: r.metodo_clave,
    referencia: r.referencia, monto: num(r.monto),
    anulado: r.anulado, motivoAnulacion: r.motivo_anulacion,
    facturas: r.facturas
  }));

  const efectivo = porMetodo.get('efectivo');
  const efectivoCobrado = efectivo ? efectivo.monto : 0;
  const { salidas, total: salidasEfectivo } = await salidasDeCaja(pool, dia);

  return {
    fecha: dia,
    cobros,
    salidas,
    resumen: {
      total: dinero(vigentes.reduce((s, r) => s + num(r.monto), 0)),
      cantidad: vigentes.length,
      anulados: rows.length - vigentes.length,
      porMetodo: [...porMetodo.values()].sort((a, b) => b.monto - a.monto),
      efectivoCobrado,
      salidasEfectivo,
      // Lo que la caja debería tener en billetes: lo cobrado menos lo que salió.
      efectivoEsperado: dinero(efectivoCobrado - salidasEfectivo)
    },
    cierre: await cierreDe(dia)
  };
}

/** La forma en que se devuelve un cierre, para no escribirla dos veces. */
function aVista(c) {
  if (!c) return null;
  return {
    id: c.id, fecha: c.fecha,
    efectivoEsperado: num(c.efectivo_esperado),
    salidasEfectivo: num(c.salidas_efectivo),
    efectivoContado: num(c.efectivo_contado),
    diferencia: num(c.diferencia),
    totalPorMetodo: c.total_por_metodo,
    observaciones: c.observaciones,
    motivoDiferencia: c.motivo_diferencia,
    cerradoPor: c.cerrado_por, cerradoEn: c.cerrado_en,
    reabiertoEn: c.reabierto_en, motivoReapertura: c.motivo_reapertura
  };
}

/** El cierre de un día, si ya se hizo. */
async function cierreDe(fecha) {
  const dia = diaValido(fecha);
  const { rows } = await pool.query('SELECT * FROM cierre_caja WHERE fecha = $1::date', [dia]);
  return aVista(rows[0]);
}

/**
 * Cerrar el día: se cuenta el efectivo y se compara con lo esperado.
 *
 * @param {string} datos.fecha
 * @param {number} datos.efectivoContado  lo que hay en la caja, contado
 * @param {string} datos.motivoDiferencia obligatorio si no cuadra
 */
async function cerrarCaja(datos = {}, usuarioId = null) {
  const dia = diaValido(datos.fecha);

  if (datos.efectivoContado === undefined || datos.efectivoContado === null || datos.efectivoContado === '') {
    throw httpError(400, 'Falta el efectivo contado.');
  }
  const contado = dinero(datos.efectivoContado);
  if (contado < 0) throw httpError(400, 'El efectivo contado no puede ser negativo.');

  return enTransaccion(async (cliente) => {
    const { rows: previos } = await cliente.query(
      'SELECT * FROM cierre_caja WHERE fecha = $1::date FOR UPDATE', [dia]);
    if (previos[0]) {
      throw httpError(409,
        `El ${dia} ya está cerrado. Para cambiarlo hay que reabrirlo, y queda anotado quién lo hizo.`);
    }

    // El esperado se calcula ACÁ y se guarda: después puede anularse un cobro
    // y la diferencia que alguien firmó no puede cambiar sola.
    const { rows: metodos } = await cliente.query(
      `SELECT COALESCE(mp.clave, lower(COALESCE(p.metodo_pago_texto, 'otros'))) AS clave,
              MIN(COALESCE(mp.nombre, p.metodo_pago_texto, 'Otros')) AS metodo,
              SUM(p.monto) AS monto, COUNT(*)::int AS cantidad
         FROM pago p
         LEFT JOIN metodo_pago mp ON mp.id = p.metodo_pago_id
        WHERE p.fecha = $1::date AND p.anulado = FALSE
        GROUP BY 1`,
      [dia]
    );

    const porMetodo = metodos.map(m => ({
      clave: m.clave, metodo: m.metodo, monto: dinero(m.monto), cantidad: m.cantidad
    }));
    const cobrado = dinero((porMetodo.find(m => m.clave === 'efectivo') || {}).monto || 0);
    const { total: salidasEfectivo } = await salidasDeCaja(cliente, dia);
    const esperado = dinero(cobrado - salidasEfectivo);
    const diferencia = dinero(contado - esperado);

    // Un faltante sin explicación es un faltante; con explicación es un hecho.
    const motivo = datos.motivoDiferencia ? String(datos.motivoDiferencia).trim() : '';
    if (Math.abs(diferencia) >= 1 && !motivo) {
      throw httpError(400,
        diferencia > 0
          ? `Sobran ₡${diferencia} en la caja: escriba de dónde salieron.`
          : `Faltan ₡${Math.abs(diferencia)} en la caja: escriba qué pasó.`);
    }

    const { rows } = await cliente.query(
      `INSERT INTO cierre_caja
         (fecha, efectivo_esperado, efectivo_contado, diferencia, total_por_metodo,
          observaciones, motivo_diferencia, cerrado_por, salidas_efectivo)
       VALUES ($1::date, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
       RETURNING *`,
      [
        dia, esperado, contado, diferencia, JSON.stringify(porMetodo),
        datos.observaciones ? String(datos.observaciones).slice(0, 2000) : null,
        motivo || null, usuarioId, salidasEfectivo
      ]
    );

    await registrarCambio(cliente, {
      entidad: 'cierre_caja', entidadId: rows[0].id, accion: 'crear',
      despues: { fecha: dia, esperado, salidas: salidasEfectivo, contado, diferencia, motivo: motivo || null },
      usuarioId
    });

    // Se devuelve lo que retornó el INSERT, NO una relectura: `cierreDe` usa
    // el pool —otra conexión— y la transacción todavía no confirmó, así que
    // no vería la fila y devolvía null.
    return aVista(rows[0]);
  });
}

/**
 * Reabrir un día cerrado, con motivo. No borra el cierre anterior: lo marca,
 * porque un segundo conteo que pise al primero en silencio no prueba nada.
 */
async function reabrirCaja(fecha, { motivo } = {}, usuarioId = null) {
  const dia = diaValido(fecha);
  const razon = motivo ? String(motivo).trim() : '';
  if (!razon) throw httpError(400, 'Escriba por qué se reabre el cierre.');

  return enTransaccion(async (cliente) => {
    const { rows } = await cliente.query(
      'SELECT * FROM cierre_caja WHERE fecha = $1::date FOR UPDATE', [dia]);
    const cierre = rows[0];
    if (!cierre) throw httpError(404, `El ${dia} no está cerrado.`);

    await cliente.query(
      `UPDATE cierre_caja
          SET reabierto_en = CURRENT_TIMESTAMP, reabierto_por = $2, motivo_reapertura = $3
        WHERE id = $1`,
      [cierre.id, usuarioId, razon]
    );

    await registrarCambio(cliente, {
      entidad: 'cierre_caja', entidadId: cierre.id, accion: 'editar',
      antes: { contado: num(cierre.efectivo_contado), diferencia: num(cierre.diferencia) },
      despues: { reabierto: true, motivo: razon },
      usuarioId
    });

    // Se borra la fila para que el día pueda cerrarse de nuevo, pero el paso
    // quedó en la bitácora con el conteo anterior y el motivo.
    await cliente.query('DELETE FROM cierre_caja WHERE id = $1', [cierre.id]);
    return { fecha: dia, reabierto: true, motivo: razon };
  });
}

module.exports = { resumenDelDia, cierreDe, cerrarCaja, reabrirCaja };
