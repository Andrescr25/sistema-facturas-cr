/**
 * La ficha completa de un cliente: todo lo suyo en una pantalla.
 *
 * POR QUÉ EXISTE. Hoy para contestar "¿cómo viene este cliente?" hay que
 * abrir tres pantallas: Cuentas por Cobrar para el saldo, Reporte de Clientes
 * para lo que compra y el portal para sus pedidos. Cuando alguien llama por
 * teléfono, ese recorrido no se hace: se contesta con lo que se recuerda.
 *
 * TODO SALE DE LA BASE PROPIA, en consultas paralelas. Las 5.398 facturas
 * tienen sus 52.357 líneas copiadas, así que el historial de compras ya no
 * necesita `venta_historico`, que se llenaba desde Alegra.
 *
 * SE MUESTRA LO QUE CABE, NO TODO. Un cliente con 1.549 ventas no se revisa
 * en una lista: van las últimas y los totales. Para el detalle está la
 * pantalla de facturas, que ya sabe filtrar por cliente.
 */

const { pool } = require('../../../config/database');
const { idValido, httpError } = require('../../utils/validacion');
const { COBRADO, ACREDITADO } = require('../facturacion/facturaConsulta.service');
const { hoyEnCostaRica } = require('../../utils/fechaCR');
const ciclos = require('../rutas/documentosCiclo.service');
const { ULTIMA_ATENCION_SQL, rotacionDe } = require('./rotacion');

const ULTIMAS = 10;
const MESES_HISTORIAL = 12;

const n = (v) => (v === null || v === undefined ? null : Number(v));
const redondear = (v) => Math.round((Number(v) || 0) * 100) / 100;

/**
 * @param {number|string} id  el id de NUESTRA ficha, no el de Alegra
 */
async function resumenDeCliente(id) {
  const cliente = idValido(id);
  const hoy = hoyEnCostaRica();

  const { rows: ficha } = await pool.query(
    `SELECT c.*, p.nombre AS plazo, p.dias AS plazo_dias, r.nombre AS ruta_nombre,
            ${ULTIMA_ATENCION_SQL('c.id')} AS ultima_factura
       FROM cliente c LEFT JOIN plazo_credito p ON p.id = c.plazo_credito_id
       LEFT JOIN ruta_cliente r ON r.id = c.ruta_id
      WHERE c.id = $1`, [cliente]);
  if (!ficha[0]) throw httpError(404, 'No existe ese cliente.');

  const [saldo, facturas, abonos, compras, productos, pedidos, pendientes] = await Promise.all([
    // Lo que debe HOY. El saldo se calcula: anular un cobro lo devuelve solo.
    pool.query(`
      WITH pendiente AS (
        SELECT f.fecha_vencimiento, f.total - ${COBRADO} - ${ACREDITADO} AS saldo
          FROM factura f WHERE f.cliente_id = $1 AND f.estado = 'emitida'
      )
      SELECT COUNT(*)::int facturas,
             COALESCE(SUM(saldo), 0) total,
             COUNT(*) FILTER (WHERE fecha_vencimiento < $2::date)::int vencidas,
             COALESCE(SUM(saldo) FILTER (WHERE fecha_vencimiento < $2::date), 0) vencido,
             MIN(fecha_vencimiento) FILTER (WHERE fecha_vencimiento IS NOT NULL) vence_primero
        FROM pendiente WHERE saldo > 1`, [cliente, hoy]),

    // Las últimas, con su saldo: es lo que se mira al hablar con él.
    pool.query(`
      SELECT f.id, f.numero, f.fecha, f.fecha_vencimiento, f.estado, f.total, f.electronica,
             f.total - ${COBRADO} - ${ACREDITADO} AS saldo,
             f.preventa_anticipada, ${ciclos.COLUMNAS_CICLO}
        FROM factura f ${ciclos.JOIN_CICLO('f')} WHERE f.cliente_id = $1
       ORDER BY f.fecha DESC, f.id DESC LIMIT ${ULTIMAS}`, [cliente]),

    // Los cobros, incluidos los anulados y marcados: esconderlos haría que
    // el cliente pregunte por un pago que sí existió y nadie lo encuentre.
    // El método sale del CATÁLOGO, no de `metodo_pago_texto`. Ese campo
    // guarda la palabra de Alegra tal cual —"cash", "TRANSFER"— y mostrarla
    // le deja al cajero un inglés que no significa nada. 1.325 de los 1.354
    // cobros copiados ya están ligados; a los 29 que no, se les muestra su
    // texto antes que nada.
    pool.query(`
      SELECT p.id, p.numero, p.fecha, p.monto, p.referencia, p.anulado,
             COALESCE(mp.nombre, NULLIF(p.metodo_pago_texto, '')) AS metodo
        FROM pago p LEFT JOIN metodo_pago mp ON mp.id = p.metodo_pago_id
       WHERE p.cliente_id = $1
       ORDER BY p.fecha DESC, p.id DESC LIMIT ${ULTIMAS}`, [cliente]),

    // Cómo viene comprando. El promedio se saca de las emitidas: una anulada
    // no es una venta y lo bajaría sin que nadie entienda por qué.
    pool.query(`
      SELECT COUNT(*)::int facturas, COALESCE(SUM(total), 0) total,
             MAX(fecha) ultima, MIN(fecha) primera
        FROM factura
       WHERE cliente_id = $1 AND estado = 'emitida'
         AND fecha >= $2::date - INTERVAL '${MESES_HISTORIAL} months'`, [cliente, hoy]),

    // Qué se lleva. Por PRODUCTO, no por el texto de la línea: la misma
    // plomada aparecía dos veces en la lista porque en unas facturas la línea
    // trae la referencia y en otras no, y agrupar por el texto las partía en
    // dos entradas con la mitad del monto cada una. Cuando la línea no tiene
    // producto —las viejas de Alegra— se cae al nombre, que es lo único que
    // hay.
    pool.query(`
      SELECT COALESCE(l.producto_id::text, 'n:' || l.nombre) AS clave,
             MIN(l.nombre) nombre, MIN(l.producto_id) producto_id,
             MIN(NULLIF(l.referencia, '')) referencia,
             SUM(l.cantidad) cantidad, SUM(l.total) total,
             COUNT(DISTINCT l.factura_id)::int veces, MAX(f.fecha) ultima
        FROM factura_linea l JOIN factura f ON f.id = l.factura_id
       WHERE f.cliente_id = $1 AND f.estado = 'emitida'
         AND f.fecha >= $2::date - INTERVAL '${MESES_HISTORIAL} months'
       GROUP BY clave
       ORDER BY total DESC LIMIT ${ULTIMAS}`, [cliente, hoy]),

    // El id propio incluye portal y agente, también sin cuenta del portal.
    // No volver al contacto externo: una ficha creada acá puede no tenerlo.
    pool.query(`
      SELECT pc.id, pc.estado, pc.creado_en, pc.total, pc.origen,
             pc.preventa_anticipada, ${ciclos.COLUMNAS_CICLO}
        FROM pedido_cliente pc ${ciclos.JOIN_CICLO('pc')}
       WHERE pc.cliente_id = $1
       ORDER BY pc.creado_en DESC, pc.id DESC LIMIT ${ULTIMAS}`, [cliente]),
    // Deudas de cualquier fecha, no solo las últimas diez facturas.
    pool.query(`SELECT * FROM (
      SELECT f.id, f.numero, f.fecha, f.fecha_vencimiento,
        f.total - ${COBRADO} - ${ACREDITADO} AS saldo,
        f.preventa_anticipada, ${ciclos.COLUMNAS_CICLO}
      FROM factura f ${ciclos.JOIN_CICLO('f')} WHERE f.cliente_id=$1 AND f.estado='emitida'
    ) q WHERE saldo>1 ORDER BY fecha, id`, [cliente])
  ]);

  const s = saldo.rows[0];
  const c = compras.rows[0];
  const facturadas = c.facturas || 0;

  const { ultima_factura: ultimaFactura, ...datosFicha } = ficha[0];

  return {
    cliente: {
      ...datosFicha,
      limite_credito: n(ficha[0].limite_credito),
      correos_adicionales: ficha[0].correos_adicionales || []
    },
    // De TODAS sus facturas emitidas, no de los últimos doce meses como
    // «compras»: a quien no compra hace un año es a quien más toca visitar.
    rotacion: rotacionDe({ rotacionDias: ficha[0].rotacion_dias, ultimaFactura, hoy }),
    saldo: {
      facturas: s.facturas,
      total: redondear(s.total),
      vencidas: s.vencidas,
      vencido: redondear(s.vencido),
      vencePrimero: s.vence_primero,
      // Cuánto del crédito que se le dio está usado. Sin límite puesto no se
      // inventa un porcentaje: `null` dice "no hay límite", no "va en cero".
      limite: n(ficha[0].limite_credito),
      disponible: ficha[0].limite_credito === null
        ? null
        : redondear(Number(ficha[0].limite_credito) - Number(s.total))
    },
    compras: {
      meses: MESES_HISTORIAL,
      facturas: facturadas,
      total: redondear(c.total),
      promedio: facturadas ? redondear(Number(c.total) / facturadas) : 0,
      ultima: c.ultima,
      primera: c.primera
    },
    facturas: facturas.rows.map((f) => ({
      id: f.id, numero: f.numero, fecha: f.fecha, vencimiento: f.fecha_vencimiento,
      estado: f.estado, electronica: f.electronica,
      total: n(f.total), saldo: Math.max(0, redondear(f.saldo)),
      ciclo: ciclos.aCiclo(f), anticipado: Boolean(f.preventa_anticipada)
    })),
    facturasPendientes: pendientes.rows.map(f => ({ id: f.id, numero: f.numero, fecha: f.fecha,
      vencimiento: f.fecha_vencimiento, saldo: Math.max(0, redondear(f.saldo)),
      ciclo: ciclos.aCiclo(f), anticipado: Boolean(f.preventa_anticipada) })),
    abonos: abonos.rows.map((a) => ({
      id: a.id, numero: a.numero, fecha: a.fecha, monto: n(a.monto),
      metodo: a.metodo, referencia: a.referencia, anulado: a.anulado
    })),
    productos: productos.rows.map((p) => ({
      clave: p.clave, nombre: p.nombre, referencia: p.referencia, productoId: p.producto_id,
      cantidad: n(p.cantidad), total: redondear(p.total), veces: p.veces, ultima: p.ultima
    })),
    pedidos: pedidos.rows.map((p) => ({
      id: p.id, estado: p.estado, fecha: p.creado_en, total: n(p.total), origen: p.origen,
      ciclo: ciclos.aCiclo(p), anticipado: Boolean(p.preventa_anticipada)
    }))
  };
}

module.exports = { resumenDeCliente, ULTIMAS, MESES_HISTORIAL };
