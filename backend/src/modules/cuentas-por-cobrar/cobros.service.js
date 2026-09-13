/**
 * Cobros sobre la base propia.
 *
 * Reemplaza el camino que iba a `POST /payments` de Alegra y leía de un
 * espejo sincronizado cada 30 minutos. Acá el saldo no se sincroniza: se
 * CALCULA —total, menos los cobros vigentes, menos las notas de crédito
 * vigentes—, así que no puede quedar viejo.
 *
 * DECISIONES
 *
 * 1. EL SALDO SE RELEE CON BLOQUEO ANTES DE APLICAR. Nunca se confía en lo
 *    que mandó el navegador: entre que la pantalla mostró ₡10.000 y alguien
 *    apretó "cobrar", otra persona pudo haber cobrado en otra caja. El
 *    `FOR UPDATE` hace que la segunda espere y vea el saldo ya rebajado.
 *
 * 2. "SALDAR TOTAL" USA EL SALDO RECIÉN LEÍDO, no el que venía en la
 *    pantalla. Es la misma regla que ya tenía el camino viejo, y por la misma
 *    razón.
 *
 * 3. UN COBRO NO SE BORRA: SE ANULA, con su motivo. El saldo vuelve solo
 *    porque se calcula. Borrarlo dejaría al cliente preguntando por un pago
 *    que hizo y del que no quedó rastro.
 *
 * 4. NO SE COBRA MÁS QUE EL SALDO. Un excedente no es un abono: es plata que
 *    hay que devolver o dejar a cuenta, y eso es otra conversación.
 */

const { pool } = require('../../../config/database');
const { registrarCambio } = require('../../utils/bitacora');
const { httpError, idValido } = require('../../utils/validacion');
const { enTransaccion: enTransaccionCon } = require('../../utils/transaccion');
const { COBRADO, ACREDITADO } = require('../facturacion/facturaConsulta.service');
const { hoyEnCostaRica } = require('../../utils/fechaCR');

const enTransaccion = (trabajo) => enTransaccionCon(pool, trabajo);
const dinero = (v) => Math.round((Number(v) || 0) * 100) / 100;
const num = (v) => Number(v) || 0;

/** Quita acentos, igual que la búsqueda de facturas. */
const NORMALIZAR_SQL = (expr) => `translate(lower(${expr}), 'áéíóúüñ', 'aeiouun')`;
const normalizar = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * A quién hay que cobrarle, y cuánto.
 *
 * Agrupado por cliente porque así se cobra: uno no llama "por la factura
 * 4868", llama a la pulpería y le pregunta por todo lo que debe.
 */
async function listarDeudores({ buscar = '', pagina = 1, limite = 30 } = {}) {
  const params = [];
  const agregar = (v) => { params.push(v); return `$${params.length}`; };

  let filtroBusqueda = '';
  const texto = String(buscar).trim();
  if (texto) {
    filtroBusqueda = ` AND ${NORMALIZAR_SQL("f.cliente_nombre || ' ' || COALESCE(f.cliente_identificacion, '')")} LIKE ${agregar(`%${normalizar(texto)}%`)}`;
  }

  const lim = Math.min(Math.max(parseInt(limite, 10) || 30, 1), 100);
  const pag = Math.max(parseInt(pagina, 10) || 1, 1);

  const { rows } = await pool.query(`
    WITH con_saldo AS (
      SELECT f.id, f.numero, f.fecha, f.fecha_vencimiento, f.cliente_id,
             f.cliente_nombre, f.cliente_identificacion, f.cliente_telefono,
             f.total,
             f.total - ${COBRADO} - ${ACREDITADO} AS saldo
        FROM factura f
       WHERE f.estado = 'emitida'
         AND f.total - ${COBRADO} - ${ACREDITADO} > 1
         ${filtroBusqueda}
    )
    SELECT cliente_id, cliente_nombre, cliente_identificacion, cliente_telefono,
           COUNT(*)::int AS facturas,
           SUM(saldo) AS saldo_total,
           MIN(fecha_vencimiento) AS vence_primero,
           COUNT(*) OVER() AS total_filas,
           json_agg(json_build_object(
             'id', id, 'numero', numero, 'fecha', fecha,
             'fechaVencimiento', fecha_vencimiento, 'total', total, 'saldo', saldo
           ) ORDER BY fecha) AS detalle
      FROM con_saldo
     GROUP BY cliente_id, cliente_nombre, cliente_identificacion, cliente_telefono
     ORDER BY SUM(saldo) DESC
     LIMIT ${agregar(lim)} OFFSET ${agregar((pag - 1) * lim)}
  `, params);

  const total = rows[0] ? Number(rows[0].total_filas) : 0;
  return {
    data: rows.map(r => ({
      clienteId: r.cliente_id,
      nombre: r.cliente_nombre,
      identificacion: r.cliente_identificacion,
      telefono: r.cliente_telefono,
      facturas: r.facturas,
      saldoTotal: num(r.saldo_total),
      vencePrimero: r.vence_primero,
      detalle: (r.detalle || []).map(f => ({ ...f, total: num(f.total), saldo: num(f.saldo) }))
    })),
    paginacion: { total, pagina: pag, limite: lim, paginas: Math.ceil(total / lim) }
  };
}

/** Los abonos de una factura. Los anulados van MARCADOS, no escondidos. */
async function abonosDeFactura(facturaId) {
  const id = idValido(facturaId);
  const { rows } = await pool.query(
    `SELECT p.id, p.fecha, p.metodo_pago_texto, p.referencia, p.cuenta_texto,
            p.anulado, p.motivo_anulacion, p.observaciones, pf.monto
       FROM pago_factura pf
       JOIN pago p ON p.id = pf.pago_id
      WHERE pf.factura_id = $1
      ORDER BY p.fecha, p.id`,
    [id]
  );
  return rows.map(r => ({
    id: r.id, fecha: r.fecha, metodo: r.metodo_pago_texto, referencia: r.referencia,
    cuenta: r.cuenta_texto, anulado: r.anulado, motivoAnulacion: r.motivo_anulacion,
    observaciones: r.observaciones, monto: num(r.monto)
  }));
}

/** La factura con su saldo, leída con bloqueo dentro de la transacción. */
async function traerFacturaConSaldo(cliente, facturaId) {
  const { rows } = await cliente.query(
    `SELECT f.*, f.total - ${COBRADO} - ${ACREDITADO} AS saldo_real
       FROM factura f
      WHERE f.id = $1
      FOR UPDATE`,
    [facturaId]
  );
  const factura = rows[0];
  if (!factura) throw httpError(404, 'No existe esa factura.');
  if (factura.estado === 'anulada') {
    throw httpError(409, `La factura ${factura.numero} está anulada: no se le puede aplicar un abono.`);
  }
  if (factura.estado !== 'emitida') {
    throw httpError(409, `La factura ${factura.numero} todavía es un borrador.`);
  }
  return factura;
}

/**
 * Registrar un abono sobre una factura.
 *
 * @param {number}  datos.facturaId
 * @param {number}  datos.monto        lo que entregó el cliente
 * @param {boolean} datos.saldarTotal  cobra el saldo recién leído, no el de la pantalla
 */
async function registrarAbono(datos = {}, usuarioId = null) {
  const facturaId = idValido(datos.facturaId);
  const metodoId = Number(datos.metodoPagoId);
  if (!metodoId) throw httpError(400, 'Falta el método de pago.');

  return enTransaccion(async (cliente) => {
    const factura = await traerFacturaConSaldo(cliente, facturaId);
    const saldo = dinero(factura.saldo_real);

    if (saldo <= 0) {
      throw httpError(409, `La factura ${factura.numero} ya no tiene saldo pendiente.`);
    }

    // "Saldar total" usa el saldo RECIÉN LEÍDO: entre que la pantalla lo
    // mostró y alguien apretó, otra caja pudo haber cobrado.
    const monto = datos.saldarTotal ? saldo : dinero(datos.monto);
    if (monto <= 0) throw httpError(400, 'El monto del abono tiene que ser mayor que cero.');
    if (monto > saldo + 0.01) {
      throw httpError(400,
        `El abono de ₡${monto} supera el saldo de la factura ${factura.numero}, que es ₡${saldo}.`);
    }

    const { rows: metodos } = await cliente.query(
      'SELECT id, nombre, pide_referencia FROM metodo_pago WHERE id = $1 AND activo = TRUE',
      [metodoId]
    );
    const metodo = metodos[0];
    if (!metodo) throw httpError(400, 'Ese método de pago no existe o está inactivo.');

    const referencia = datos.referencia ? String(datos.referencia).trim().slice(0, 60) : null;
    if (metodo.pide_referencia && !referencia) {
      throw httpError(400, `${metodo.nombre}: falta el número de referencia del pago.`);
    }

    const fecha = datos.fecha ? String(datos.fecha).slice(0, 10) : hoyEnCostaRica();

    const { rows } = await cliente.query(
      `INSERT INTO pago (fecha, cliente_id, cliente_nombre, metodo_pago_id, metodo_pago_texto,
                         cuenta_dinero_id, cuenta_texto, referencia, monto, observaciones, registrado_por)
       VALUES ($1, $2, $3, $4, $5,
               (SELECT id FROM cuenta_dinero WHERE nombre = 'Caja general' AND activo LIMIT 1),
               'Caja general', $6, $7, $8, $9)
       RETURNING *`,
      [
        fecha, factura.cliente_id, factura.cliente_nombre,
        metodo.id, String(metodo.nombre).slice(0, 40), referencia, monto,
        datos.observaciones ? String(datos.observaciones).slice(0, 2000) : null,
        usuarioId
      ]
    );
    const pago = rows[0];

    await cliente.query(
      'INSERT INTO pago_factura (pago_id, factura_id, monto) VALUES ($1, $2, $3)',
      [pago.id, factura.id, monto]
    );

    await registrarCambio(cliente, {
      entidad: 'pago', entidadId: pago.id, accion: 'crear',
      despues: {
        factura: factura.numero, cliente: factura.cliente_nombre,
        monto, metodo: metodo.nombre, saldoAntes: saldo, saldoDespues: dinero(saldo - monto)
      },
      usuarioId
    });

    return {
      ...pago,
      monto: num(pago.monto),
      factura: { id: factura.id, numero: factura.numero },
      saldoAnterior: saldo,
      saldoNuevo: dinero(saldo - monto)
    };
  });
}

/**
 * Anular un abono. No lo borra: queda con su motivo y el saldo de la factura
 * vuelve solo, porque se calcula.
 */
async function anularAbono(id, { motivo } = {}, usuarioId = null) {
  const pagoId = idValido(id);
  const razon = motivo ? String(motivo).trim().slice(0, 500) : '';
  if (!razon) throw httpError(400, 'Escriba por qué se anula el abono.');

  return enTransaccion(async (cliente) => {
    const { rows } = await cliente.query('SELECT * FROM pago WHERE id = $1 FOR UPDATE', [pagoId]);
    const pago = rows[0];
    if (!pago) throw httpError(404, 'No existe ese abono.');
    // Anular lo ya anulado no es un error: el resultado es el que se pedía.
    if (pago.anulado) return { ...pago, monto: num(pago.monto) };

    const { rows: actualizado } = await cliente.query(
      `UPDATE pago
          SET anulado = TRUE, motivo_anulacion = $2, actualizado_en = CURRENT_TIMESTAMP
        WHERE id = $1
      RETURNING *`,
      [pagoId, razon]
    );

    await registrarCambio(cliente, {
      entidad: 'pago', entidadId: pagoId, accion: 'anular',
      antes: { anulado: false, monto: num(pago.monto) },
      despues: { anulado: true, motivo: razon },
      usuarioId
    });

    return { ...actualizado[0], monto: num(actualizado[0].monto) };
  });
}

module.exports = { listarDeudores, abonosDeFactura, registrarAbono, anularAbono };
