/**
 * Buscar y ver facturas en la base propia.
 *
 * Las 5.398 facturas ya están copiadas, pero hasta ahora no había forma de
 * consultarlas sin ir a Alegra. Esto es lo que las vuelve útiles: buscar por
 * número, por cliente o por fecha, y abrir una con sus líneas, sus cobros y
 * sus notas de crédito.
 *
 * DECISIONES
 *
 * 1. EL SALDO QUE SE MUESTRA EXCLUYE LOS COBROS ANULADOS. Hay uno así entre
 *    los 1.350 copiados (₡84.127,90): sumar `pago_factura` sin filtrar
 *    `pago.anulado` mostraría esa factura como pagada cuando no lo está.
 *
 * 2. LA BÚSQUEDA POR NÚMERO ACEPTA EL PEDAZO FINAL. Nadie teclea
 *    "001000014868": en el mostrador se dice "la 4868". Se busca por
 *    terminación además de por texto completo.
 *
 * 3. NO SE DEVUELVE TODO. El listado pagina y trae lo justo para una tabla;
 *    las líneas solo salen al abrir una factura.
 */

const ciclos = require('../rutas/documentosCiclo.service');
const { pool } = require('../../../config/database');
const { httpError, idValido } = require('../../utils/validacion');
const { COBRADO, ACREDITADO } = require('./saldo.sql');

const LIMITE_MAXIMO = 100;

/** Quita acentos y pasa a minúsculas, igual en la consulta y en lo buscado. */
const NORMALIZAR_SQL = (expr) => `translate(lower(${expr}), 'áéíóúüñ', 'aeiouun')`;
function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const numero = (v) => (v === null || v === undefined ? null : Number(v));

/**
 * Una línea de venta, como la leen la pantalla y el PDF. `factura_linea` y
 * `nota_credito_linea` tienen las mismas columnas: la nota de crédito
 * (notaCreditoConsulta.service.js) usa estas dos cosas tal cual.
 */
const COLUMNAS_LINEA = `numero_linea, producto_id, nombre, referencia, descripcion, cabys, unidad,
              cantidad, precio_unitario, descuento_porcentaje, descuento_monto,
              tarifa, impuesto_monto, total`;
const lineaAVista = (l) => ({
  numeroLinea: l.numero_linea,
  productoId: l.producto_id,
  nombre: l.nombre,
  referencia: l.referencia,
  descripcion: l.descripcion,
  cabys: l.cabys,
  unidad: l.unidad,
  cantidad: numero(l.cantidad),
  precioUnitario: numero(l.precio_unitario),
  descuentoPorcentaje: numero(l.descuento_porcentaje),
  descuentoMonto: numero(l.descuento_monto),
  tarifa: numero(l.tarifa),
  impuestoMonto: numero(l.impuesto_monto),
  total: numero(l.total)
});

/**
 * El saldo real de cada factura: total, menos los cobros VIGENTES, menos lo
 * acreditado por notas de crédito. Se calcula, no se guarda: un cobro que se
 * anula tiene que devolver el saldo solo.
 */
function aVista(f) {
  if (!f) return f;
  const total = numero(f.total) || 0;
  const cobrado = numero(f.cobrado) || 0;
  const acreditado = numero(f.acreditado) || 0;
  return {
    id: f.id,
    ciclo: ciclos.aCiclo(f), anticipado: Boolean(f.preventa_anticipada),
    numero: f.numero,
    serie: f.serie,
    consecutivo: numero(f.consecutivo),
    tipoDocumento: f.tipo_documento,
    electronica: f.electronica,
    historica: Boolean(f.alegra_id),
    // Una factura es electrónica cuando Hacienda la ACEPTA, no cuando se
    // manda. Entre las dos cosas hay un rato y puede haber un rechazo.
    haciendaEstado: f.hacienda_estado,
    fiscal: f.fiscal || null,
    estado: f.estado,
    fecha: f.fecha,
    fechaVencimiento: f.fecha_vencimiento,
    cliente: {
      id: f.cliente_id,
      nombre: f.cliente_nombre,
      tipoIdentificacion: f.cliente_tipo_identificacion,
      identificacion: f.cliente_identificacion,
      // Copia fija tomada al facturar: el papel se reimprime igual dentro de
      // dos años aunque la ficha del cliente haya cambiado.
      correo: f.cliente_correo,
      telefono: f.cliente_telefono,
      direccion: f.cliente_direccion
    },
    condicionVenta: f.condicion_venta,
    plazo: f.plazo_texto,
    moneda: f.moneda || 'CRC',
    metodoPago: f.metodo_pago_texto,
    vendedor: f.vendedor,
    actividadEconomica: f.actividad_economica,
    subtotal: numero(f.subtotal),
    descuento: numero(f.descuento),
    impuesto: numero(f.impuesto),
    total,
    cobrado,
    acreditado,
    // Lo que el cliente debe HOY. Nunca negativo: si se acreditó y se cobró de
    // más, el excedente es otra conversación, no una deuda en contra.
    saldo: Math.max(0, Math.round((total - cobrado - acreditado) * 100) / 100),
    motivoAnulacion: f.motivo_anulacion,
    observaciones: f.observaciones,
    lineas: numero(f.lineas)
  };
}

/**
 * @param {object} filtros
 * @param {string} filtros.buscar        número, cliente o cédula
 * @param {'ventas'|'electronicas'|'emitidas'|'anuladas'|'borradores'|'con_saldo'|'todas'} filtros.estado
 * @param {string} filtros.desde         AAAA-MM-DD
 * @param {string} filtros.hasta         AAAA-MM-DD
 */
async function listarFacturas({ buscar = '', estado = 'emitidas', desde = '', hasta = '', clienteId = '', pagina = 1, limite = 30 } = {}) {
  const where = [];
  const params = [];
  const agregar = (valor) => { params.push(valor); return `$${params.length}`; };

  switch (estado) {
    // LAS EMITIDAS, EN DOS LISTAS (pedido del usuario, 2026-10-11): «que el
    // tab que dice "emitidas" se divida en Facturas de venta y Facturas
    // electrónicas, para que no me salgan ambas». Electrónica es la que
    // Hacienda ACEPTÓ —factura o tiquete—, la misma regla de la etiqueta de
    // cada documento: una enviada sin respuesta, o rechazada, sigue siendo
    // de venta. Así ninguna emitida queda fuera de las dos ni en las dos.
    case 'ventas': where.push("f.estado = 'emitida' AND f.electronica IS NOT TRUE"); break;
    case 'electronicas': where.push("f.estado = 'emitida' AND f.electronica IS TRUE"); break;
    // Las dos juntas: lo sigue usando quien llama sin decir cuál quiere.
    case 'emitidas': where.push("f.estado = 'emitida'"); break;
    case 'anuladas': where.push("f.estado = 'anulada'"); break;
    case 'borradores': where.push("f.estado = 'borrador'"); break;
    // Las que de verdad se le pueden cobrar a alguien.
    case 'con_saldo': where.push(`f.estado = 'emitida' AND f.total - ${COBRADO} - ${ACREDITADO} > 1`); break;
    case 'todas': break;
    default: throw httpError(400, 'Estado: tiene que ser ventas, electronicas, emitidas, anuladas, borradores, con_saldo o todas.');
  }

  const texto = String(buscar).trim();
  if (texto) {
    // Por número (completo o por su terminación: en el mostrador se dice "la
    // 4868") o por nombre o cédula del cliente.
    const partes = [];

    // El número SOLO se compara si lo buscado trae dígitos. Sin esta guarda, un
    // nombre deja el patrón en '%' —no queda nada después de quitarle las
    // letras— y `numero LIKE '%'` calza con TODAS las facturas: buscar "SUPER"
    // devolvía las 5.398 en vez de las de ese cliente.
    const digitos = texto.replace(/\D/g, '');
    if (digitos) partes.push(`f.numero LIKE ${agregar(`%${digitos}`)}`);

    partes.push(
      `${NORMALIZAR_SQL("f.cliente_nombre || ' ' || COALESCE(f.cliente_identificacion, '')")} LIKE ${agregar(`%${normalizar(texto)}%`)}`
    );
    where.push(`(${partes.join(' OR ')})`);
  }

  if (String(desde).trim()) where.push(`f.fecha >= ${agregar(String(desde).trim())}::date`);
  if (String(hasta).trim()) where.push(`f.fecha <= ${agregar(String(hasta).trim())}::date`);
  if (String(clienteId).trim()) where.push(`f.cliente_id = ${agregar(idValido(clienteId))}`);

  const lim = Math.min(Math.max(parseInt(limite, 10) || 30, 1), LIMITE_MAXIMO);
  const pag = Math.max(parseInt(pagina, 10) || 1, 1);
  const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await pool.query(`
    SELECT f.*, ${ciclos.COLUMNAS_CICLO}, COUNT(*) OVER() AS total_filas,
           ${COBRADO} AS cobrado,
           ${ACREDITADO} AS acreditado,
           (SELECT COUNT(*) FROM factura_linea l WHERE l.factura_id = f.id)::int AS lineas
      FROM factura f
      ${ciclos.JOIN_CICLO('f')}
      ${filtro}
     ORDER BY f.fecha DESC, f.consecutivo DESC NULLS LAST
     LIMIT ${agregar(lim)} OFFSET ${agregar((pag - 1) * lim)}
  `, params);

  const total = rows[0] ? Number(rows[0].total_filas) : 0;
  return {
    data: rows.map(aVista),
    paginacion: { total, pagina: pag, limite: lim, paginas: Math.ceil(total / lim) }
  };
}

/** Una factura con todo lo que le cuelga: líneas, cobros y notas de crédito. */
async function obtenerFactura(id) {
  const n = idValido(id);
  const { rows } = await pool.query(`
    SELECT f.*, ${ciclos.COLUMNAS_CICLO}, ${COBRADO} AS cobrado, ${ACREDITADO} AS acreditado,
           (SELECT COUNT(*) FROM factura_linea l WHERE l.factura_id = f.id)::int AS lineas
      FROM factura f ${ciclos.JOIN_CICLO('f')} WHERE f.id = $1
  `, [n]);
  if (!rows[0]) throw httpError(404, 'No existe esa factura.');
  if(rows[0].hacienda_comprobante_id&&rows[0].electronica)rows[0].fiscal=await require('../../integrations/hacienda/lectura.service').aceptada(pool,rows[0].hacienda_comprobante_id);

  const [lineas, cobros, notas] = await Promise.all([
    pool.query(
      `SELECT ${COLUMNAS_LINEA}
         FROM factura_linea WHERE factura_id = $1 ORDER BY numero_linea`,
      [n]
    ),
    pool.query(
      // `monto` es lo aplicado a ESTA factura; `monto_pago` y `facturas`, el
      // recibo entero. Un cobro de Cuentas por Cobrar puede cubrir varias, y
      // anularlo las deja todas con saldo: la pantalla lo tiene que avisar.
      `SELECT p.id, p.numero, p.fecha, p.metodo_pago_texto, p.referencia, p.anulado, p.motivo_anulacion, pf.monto,
              p.monto AS monto_pago,
              (SELECT COUNT(*) FROM pago_factura x WHERE x.pago_id = p.id)::int AS facturas
         FROM pago_factura pf JOIN pago p ON p.id = pf.pago_id
        WHERE pf.factura_id = $1 ORDER BY p.fecha, p.id`,
      [n]
    ),
    pool.query(
      // De cada nota, además de cuánto acreditó: cuántas unidades devolvió
      // y cómo va ante Hacienda (su último comprobante de producción). Es lo
      // que deja decir en la factura QUÉ hizo la nota y si falta emitirla.
      `SELECT nc.id, nc.numero, nc.fecha, nc.motivo, nc.motivo_texto, nc.estado, nc.alegra_id, nf.monto,
              nc.electronica, nc.hacienda_estado,
              (SELECT COALESCE(SUM(l.cantidad), 0) FROM nota_credito_linea l WHERE l.nota_credito_id = nc.id) AS unidades,
              hc.consecutivo AS fiscal_consecutivo, hc.estado AS fiscal_estado
         FROM nota_credito_factura nf JOIN nota_credito nc ON nc.id = nf.nota_credito_id
         LEFT JOIN LATERAL (
           SELECT c.consecutivo, c.estado FROM hacienda_comprobante c
            WHERE c.ambiente = 'produccion' AND c.origen = 'nota_credito' AND c.origen_id = nc.id
            ORDER BY c.revision_documento DESC LIMIT 1) hc ON TRUE
        WHERE nf.factura_id = $1 ORDER BY nc.fecha, nc.id`,
      [n]
    )
  ]);

  return {
    ...aVista(rows[0]),
    lineas: lineas.rows.map(lineaAVista),
    // Los anulados van, marcados: esconderlos haría que el cliente pregunte
    // por un cobro que sí existió y nadie encuentre el rastro.
    cobros: cobros.rows.map(c => ({
      id: c.id, numero: c.numero, fecha: c.fecha, metodo: c.metodo_pago_texto,
      referencia: c.referencia, anulado: c.anulado, motivoAnulacion: c.motivo_anulacion,
      monto: numero(c.monto), montoPago: numero(c.monto_pago), facturas: c.facturas
    })),
    notasCredito: notas.rows.map(x => ({
      id: x.id, numero: x.numero, fecha: x.fecha, motivo: x.motivo,
      motivoTexto: x.motivo_texto, estado: x.estado, historica:Boolean(x.alegra_id), monto: numero(x.monto),
      unidades: numero(x.unidades),
      // Electrónica = aceptada por Hacienda. `fiscal` es su comprobante
      // propio, aceptado o no; las de Alegra no tienen.
      electronica: Boolean(x.electronica), haciendaEstado: x.hacienda_estado,
      fiscal: x.fiscal_consecutivo ? { consecutivo: x.fiscal_consecutivo, estado: x.fiscal_estado } : null
    }))
  };
}

module.exports = { listarFacturas, obtenerFactura, COBRADO, ACREDITADO, COLUMNAS_LINEA, lineaAVista, numero };
