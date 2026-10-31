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
 *
 * 5. TODO COBRO ENTRA A CAJA GENERAL (decisión del usuario, 2026-09-23), y
 *    puede cubrir varias facturas del mismo cliente en un solo documento.
 */

const { pool } = require('../../../config/database');
const { registrarCambio } = require('../../utils/bitacora');
const { httpError, idValido } = require('../../utils/validacion');
const { enTransaccion: enTransaccionCon } = require('../../utils/transaccion');
const { COBRADO, ACREDITADO, COLUMNAS_LINEA, lineaAVista } = require('../facturacion/facturaConsulta.service');
const { hoyEnCostaRica, diaEnCostaRica } = require('../../utils/fechaCR');
const { telefonosDe, validarTelefonoEscrito } = require('../../utils/telefonosCliente');
const { enviarYRegistrar } = require('../envios-whatsapp/envios.service');
const { CAJA_GENERAL, idCajaGeneral } = require('../../utils/cajaGeneral');

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

  // Tope de 1.000, no de 100: la pantalla pide la cartera ENTERA (unos 60
  // deudores) y filtra ahí. Con el tope de antes y sin paginación en la
  // pantalla, la mitad de los deudores —los de saldo más chico— no aparecía
  // en ningún lado.
  const lim = Math.min(Math.max(parseInt(limite, 10) || 30, 1), 1000);
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
    SELECT cliente_id,
           (array_agg(cliente_nombre ORDER BY fecha DESC, id DESC))[1] AS cliente_nombre,
           (array_agg(cliente_identificacion ORDER BY fecha DESC, id DESC)
              FILTER (WHERE cliente_identificacion IS NOT NULL))[1] AS cliente_identificacion,
           (array_agg(cliente_telefono ORDER BY fecha DESC, id DESC)
              FILTER (WHERE cliente_telefono IS NOT NULL))[1] AS cliente_telefono,
           COUNT(*)::int AS facturas,
           SUM(saldo) AS saldo_total,
           MIN(fecha_vencimiento) AS vence_primero,
           COUNT(*) OVER() AS total_filas,
           json_agg(json_build_object(
             'id', id, 'numero', numero, 'fecha', fecha,
             'fechaVencimiento', fecha_vencimiento, 'total', total, 'saldo', saldo
           ) ORDER BY fecha) AS detalle
      FROM con_saldo
     -- Un cliente es UNA fila. El nombre, la cédula y el teléfono de cada
     -- factura son la copia de ese día: el tiquete sale con el nombre de la
     -- casa y la factura electrónica con el legal. Agrupando también por esas
     -- copias, el mismo cliente salía dos veces con la deuda partida (13 de
     -- 142 al cargar producción, 2026-10-10) y la pantalla repetía su clave.
     -- Se muestra lo de su factura más reciente. Sin ficha de cliente no hay
     -- con qué unir, y ahí sí se agrupa por lo que dice la factura.
     GROUP BY cliente_id,
              CASE WHEN cliente_id IS NULL THEN cliente_nombre END,
              CASE WHEN cliente_id IS NULL THEN cliente_identificacion END,
              CASE WHEN cliente_id IS NULL THEN cliente_telefono END
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

/**
 * Contexto para cobrar: solo las líneas, con el DTO e importes de la factura.
 * Quien cobra no necesita permiso de Facturación ni haber creado la factura.
 * Una consulta distingue documento inexistente de documento sin líneas.
 */
async function productosDeFactura(facturaId) {
  const id = idValido(facturaId);
  const { rows } = await pool.query(`
    SELECT f.id AS factura_id, l.* FROM factura f
      LEFT JOIN LATERAL (
        SELECT ${COLUMNAS_LINEA} FROM factura_linea WHERE factura_id = f.id
      ) l ON TRUE
     WHERE f.id = $1 ORDER BY l.numero_linea`, [id]);
  if (!rows.length) throw httpError(404, 'No existe esa factura.');
  return rows.filter(l => l.numero_linea !== null).map(lineaAVista);
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

/**
 * Las facturas con su saldo, leídas con bloqueo dentro de la transacción. Se
 * toman todas juntas y POR ID: dos cobros simultáneos sobre las mismas
 * facturas las piden en el mismo orden y no se traban entre sí.
 */
async function traerFacturasConSaldo(cliente, facturaIds) {
  const { rows } = await cliente.query(
    `SELECT f.*, f.total - ${COBRADO} - ${ACREDITADO} AS saldo_real
       FROM factura f
      WHERE f.id = ANY($1::int[])
      ORDER BY f.id
      FOR UPDATE`,
    [facturaIds]
  );
  if (rows.length !== facturaIds.length) throw httpError(404, 'Alguna de esas facturas no existe.');
  for (const factura of rows) {
    if (factura.estado === 'anulada') {
      throw httpError(409, `La factura ${factura.numero} está anulada: no se le puede aplicar un abono.`);
    }
    if (factura.estado !== 'emitida') {
      throw httpError(409, `La factura ${factura.numero} todavía es un borrador.`);
    }
  }
  return new Map(rows.map((f) => [f.id, f]));
}

/** Una o varias facturas: la forma nueva (`aplicaciones`) o la de siempre (`facturaId`). */
function leerAplicacionesCobro(datos) {
  const lista = Array.isArray(datos.aplicaciones) && datos.aplicaciones.length
    ? datos.aplicaciones
    : [{ facturaId: datos.facturaId, monto: datos.monto, saldarTotal: datos.saldarTotal }];
  const vistas = new Set();
  return lista.map((a) => {
    const facturaId = idValido(a?.facturaId);
    if (vistas.has(facturaId)) throw httpError(400, 'La misma factura viene dos veces en el cobro.');
    vistas.add(facturaId);
    return { facturaId, saldarTotal: a.saldarTotal === true, monto: dinero(a.monto) };
  });
}

/**
 * Registrar un cobro sobre una o varias facturas del MISMO cliente: "este
 * pago cubre las facturas A, B y C". Es un solo documento (`pago`) con una
 * línea por factura (`pago_factura`), y ENTRA A CAJA GENERAL: es un solo
 * movimiento de caja (vista `movimiento_caja`), que dice qué facturas cubrió.
 *
 * @param {Array<{facturaId, monto?, saldarTotal?}>} [datos.aplicaciones]
 * @param {number}  [datos.facturaId]    forma de una sola factura, la de siempre
 * @param {number}  [datos.monto]
 * @param {boolean} [datos.saldarTotal]  cobra el saldo recién leído, no el de la pantalla
 */
async function registrarAbono(datos = {}, usuarioId = null) {
  const aplicaciones = leerAplicacionesCobro(datos);
  const metodoId = Number(datos.metodoPagoId);
  if (!metodoId) throw httpError(400, 'Falta el método de pago.');

  return enTransaccion(async (cliente) => {
    const facturas = await traerFacturasConSaldo(cliente, aplicaciones.map((a) => a.facturaId));

    // Un cobro es de UN cliente. Las facturas sin ficha (se borró en Alegra
    // antes de la copia) se agrupan por el nombre copiado.
    const clientes = new Set([...facturas.values()].map((f) => f.cliente_id ?? `nombre:${f.cliente_nombre}`));
    if (clientes.size > 1) throw httpError(400, 'Un cobro solo puede cubrir facturas del mismo cliente.');

    const detalle = aplicaciones.map((a) => {
      const factura = facturas.get(a.facturaId);
      const saldo = dinero(factura.saldo_real);
      if (saldo <= 0) {
        throw httpError(409, `La factura ${factura.numero} ya no tiene saldo pendiente.`);
      }
      // "Saldar total" usa el saldo RECIÉN LEÍDO: entre que la pantalla lo
      // mostró y alguien apretó, otra caja pudo haber cobrado.
      const monto = a.saldarTotal ? saldo : a.monto;
      if (monto <= 0) throw httpError(400, 'El monto del abono tiene que ser mayor que cero.');
      if (monto > saldo + 0.01) {
        throw httpError(400,
          `El abono de ₡${monto} supera el saldo de la factura ${factura.numero}, que es ₡${saldo}.`);
      }
      return { factura, monto: dinero(monto), saldoAntes: saldo };
    });
    const total = dinero(detalle.reduce((s, d) => s + d.monto, 0));

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
    const cajaId = await idCajaGeneral(cliente);
    const primera = detalle[0].factura;

    const { rows } = await cliente.query(
      `INSERT INTO pago (fecha, cliente_id, cliente_nombre, metodo_pago_id, metodo_pago_texto,
                         cuenta_dinero_id, cuenta_texto, referencia, monto, observaciones, registrado_por)
       VALUES ($1, $2, $3, $4, $5, $6, '${CAJA_GENERAL}', $7, $8, $9, $10)
       RETURNING *`,
      [
        fecha, primera.cliente_id, primera.cliente_nombre,
        metodo.id, String(metodo.nombre).slice(0, 40), cajaId, referencia, total,
        datos.observaciones ? String(datos.observaciones).slice(0, 2000) : null,
        usuarioId
      ]
    );
    const pago = rows[0];

    for (const d of detalle) {
      await cliente.query(
        'INSERT INTO pago_factura (pago_id, factura_id, factura_numero, monto) VALUES ($1, $2, $3, $4)',
        [pago.id, d.factura.id, d.factura.numero, d.monto]
      );
    }

    await registrarCambio(cliente, {
      entidad: 'pago', entidadId: pago.id, accion: 'crear',
      despues: {
        cliente: primera.cliente_nombre, monto: total, metodo: metodo.nombre,
        facturas: detalle.map((d) => ({
          factura: d.factura.numero, monto: d.monto,
          saldoAntes: d.saldoAntes, saldoDespues: dinero(d.saldoAntes - d.monto)
        }))
      },
      usuarioId
    });

    const facturasCobro = detalle.map((d) => ({
      id: d.factura.id, numero: d.factura.numero, monto: d.monto,
      saldoAnterior: d.saldoAntes, saldoNuevo: dinero(d.saldoAntes - d.monto)
    }));
    return {
      ...pago,
      monto: num(pago.monto),
      facturas: facturasCobro,
      // La forma de siempre, para quien cobra una sola factura.
      factura: { id: facturasCobro[0].id, numero: facturasCobro[0].numero },
      saldoAnterior: facturasCobro[0].saldoAnterior,
      saldoNuevo: facturasCobro[0].saldoNuevo
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

/** ₡1.234, con el punto de miles. */
const colones = (n) => `₡${Math.round(num(n)).toLocaleString('es-CR').replace(/\u00A0/g, '.')}`;

function diasHasta(fecha) {
  if (!fecha) return null;
  // `diaEnCostaRica` acepta el objeto Date que devuelve Postgres para una
  // columna DATE. Recortar `String(unDate)` a diez caracteres da "Wed Sep 10"
  // y de ahí salía un "vence en NaN día(s)" en el mensaje al cliente — el
  // mismo error que ya había dado un "Invalid Date" en el PDF.
  const dia = diaEnCostaRica(fecha);
  if (!dia) return null;
  const hoy = new Date(`${hoyEnCostaRica()}T12:00:00`);
  return Math.round((new Date(`${dia}T12:00:00`) - hoy) / 86400000);
}

/**
 * El texto del recordatorio.
 *
 * LO ARMA EL SERVIDOR, no el navegador: los montos del mensaje tienen que ser
 * los mismos que los de la pantalla que lo originó, y si los calculara el
 * navegador podrían no coincidir. Quien manda lo puede editar antes.
 *
 * Lleva POR DÓNDE PAGAR, que antes no llevaba: un recordatorio que dice
 * cuánto se debe pero no a qué cuenta depositar obliga a una segunda
 * conversación.
 */
function textoRecordatorio(cliente, facturas, terminosPago) {
  const pendientes = facturas
    .filter(f => num(f.saldo) > 0)
    .map(f => ({ ...f, dias: diasHasta(f.fechaVencimiento) }))
    .sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0));

  const lineas = pendientes.map(f => {
    const cuando = f.dias === null ? 'sin fecha de vencimiento'
      : f.dias < 0 ? `vencida hace ${Math.abs(f.dias)} día(s)`
      : f.dias === 0 ? 'vence hoy'
      : `vence en ${f.dias} día(s)`;
    return `• ${f.numero} — ${colones(f.saldo)} (${cuando})`;
  });

  const total = pendientes.reduce((s, f) => s + num(f.saldo), 0);

  return `Buenas ${cliente} 👋\n\n` +
    `Le recordamos su saldo pendiente con Distribuidora Tachi:\n\n` +
    `${lineas.join('\n')}\n\n` +
    `Total: ${colones(total)}\n\n` +
    (terminosPago ? `Puede pagar por:\n${terminosPago}\n\n` : '') +
    `Cualquier consulta quedamos atentos. ¡Gracias!`;
}

/** El saldo de un cliente, con sus facturas y a qué números se le puede escribir. */
async function saldoDeCliente(clienteId) {
  const id = idValido(clienteId);

  const { rows } = await pool.query(
    `SELECT f.id, f.numero, f.fecha, f.fecha_vencimiento, f.cliente_nombre,
            f.total - ${COBRADO} - ${ACREDITADO} AS saldo
       FROM factura f
      WHERE f.cliente_id = $1 AND f.estado = 'emitida'
        AND f.total - ${COBRADO} - ${ACREDITADO} > 1
      ORDER BY f.fecha`,
    [id]
  );

  if (rows.length === 0) throw httpError(404, 'Ese cliente no tiene saldo pendiente.');

  const { rows: fichas } = await pool.query(
    'SELECT nombre, telefono, telefono_secundario, celular FROM cliente WHERE id = $1', [id]);
  const ficha = fichas[0] || {};

  const facturas = rows.map(r => ({
    id: r.id, numero: r.numero, fecha: r.fecha,
    fechaVencimiento: r.fecha_vencimiento, saldo: num(r.saldo)
  }));

  const { rows: empresa } = await pool.query('SELECT terminos_pago FROM empresa WHERE id = 1');

  return {
    clienteId: id,
    cliente: ficha.nombre || rows[0].cliente_nombre,
    facturas,
    saldoTotal: dinero(facturas.reduce((s, f) => s + f.saldo, 0)),
    ...telefonosDe({
      phonePrimary: ficha.telefono, phoneSecondary: ficha.telefono_secundario, mobile: ficha.celular
    }),
    mensaje: textoRecordatorio(
      ficha.nombre || rows[0].cliente_nombre, facturas, empresa[0]?.terminos_pago)
  };
}

/** Manda el recordatorio por WhatsApp y lo deja registrado. */
async function enviarRecordatorio(clienteId, { telefono, mensaje, usuarioId } = {}) {
  const datos = await saldoDeCliente(clienteId);

  const numero = validarTelefonoEscrito(telefono);
  if (!numero.valido) {
    throw httpError(400, numero.motivo || 'Ese número no parece un teléfono de Costa Rica.');
  }

  return enviarYRegistrar({
    tipo: 'saldo',
    referencia: String(datos.clienteId),
    clienteId: datos.clienteId,
    telefono: numero.numero,
    // El texto que se manda es el que quien cobra revisó, no uno recalculado.
    mensaje: String(mensaje || datos.mensaje).trim(),
    usuarioId
  });
}

module.exports = {
  listarDeudores, productosDeFactura, abonosDeFactura, registrarAbono, anularAbono,
  saldoDeCliente, enviarRecordatorio, textoRecordatorio
};
