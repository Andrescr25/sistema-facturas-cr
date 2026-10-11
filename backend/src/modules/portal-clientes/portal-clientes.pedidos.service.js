/**
 * Portal de clientes - Pedidos vistos desde la casa
 *
 * Listar lo que entró y convertirlo en factura de venta.
 *
 * Facturar es UN CLICK, no automático: una factura electrónica es un
 * documento fiscal ante Hacienda, y anular una equivocada exige nota de
 * crédito, que le llega al cliente. Que un pedido a las 2 de la mañana se
 * vuelva documento fiscal sin que nadie lo mire es un riesgo que no compensa
 * los segundos que ahorra.
 */

const ciclos = require('../rutas/documentosCiclo.service');
const { query, httpError } = require('./portal-clientes.auth');
const { enviarYRegistrar } = require('../envios-whatsapp/envios.service');
const { pool } = require('../../../config/database');
const { idValido } = require('../../utils/validacion');
const { enTransaccion } = require('../../utils/transaccion');
const { AHORA_CR_SQL } = require('../../utils/fechaCR');
const { crearFacturaEnTransaccion } = require('../facturacion/facturaPropia.service');

async function listarPedidos({ estado = 'pendiente', rutaId, cicloId, origen } = {}) {
  const where = [], params = [];
  const agregar = v => { params.push(v); return '$' + params.length; };
  if (!['pendiente','facturado','rechazado','todos'].includes(estado)) throw httpError(400, 'Estado de pedido inválido.');
  if (estado !== 'todos') where.push(`p.estado=${agregar(estado)}`);
  ciclos.filtrarCiclo({ rutaId, cicloId }, where, agregar);
  if (origen) {
    if (!['portal','agente'].includes(origen)) throw httpError(400, 'Origen de pedido inválido.');
    where.push(`p.origen=${agregar(origen)}`);
  }
  const filtro = where.length ? 'WHERE ' + where.join(' AND ') : '';

  // LEFT JOIN, no JOIN: un pedido levantado por el agente en la calle NO
  // tiene cuenta de portal detrás (solo 5 de 239 clientes tienen), así que
  // un JOIN normal lo dejaba fuera. El pedido entraba a la base y nadie lo
  // veía nunca — que es justo lo que no puede pasar con una venta.
  const r = await query(`
    SELECT p.*, ${ciclos.COLUMNAS_CICLO},
      COALESCE(cp.nombre, p.cliente_nombre) AS cliente_nombre,
      cp.usuario,
      u.nombre AS agente_nombre,
      (SELECT COUNT(*)::int FROM pedido_cliente_linea l WHERE l.pedido_id = p.id) AS lineas
    FROM pedido_cliente p
    LEFT JOIN cliente_portal cp ON cp.id = p.cliente_portal_id
    LEFT JOIN usuario u ON u.id = p.creado_por_usuario_id
    ${ciclos.JOIN_CICLO('p')}
    ${filtro}
    ORDER BY p.creado_en DESC
    LIMIT 200;
  `, params);

  return r.rows.map(p => ({
    id: p.id,
    clienteNombre: p.cliente_nombre,
    clienteId: p.cliente_id,
    facturaId: p.factura_id,
    ciclo: ciclos.aCiclo(p), anticipado: p.preventa_anticipada,
    estado: p.estado,
    total: Number(p.total),
    lineas: p.lineas,
    observaciones: p.observaciones,
    motivoRechazo: p.motivo_rechazo,
    numeroFactura: p.numero_factura,
    origen: p.origen || 'portal',
    agenteNombre: p.agente_nombre || null,
    creadoEn: p.creado_en,
    resueltoEn: p.resuelto_en
  }));
}

async function detalle(pedidoId, db = { query }, { bloquear = false } = {}) {
  const p = await db.query(`
    SELECT p.*, ${ciclos.COLUMNAS_CICLO}, COALESCE(cp.nombre, p.cliente_nombre) AS cliente_nombre
    FROM pedido_cliente p
    LEFT JOIN cliente_portal cp ON cp.id = p.cliente_portal_id
    ${ciclos.JOIN_CICLO('p')}
    WHERE p.id = $1 ${bloquear ? 'FOR UPDATE OF p' : ''};
  `, [idValido(pedidoId)]);
  if (p.rows.length === 0) throw httpError(404, 'Pedido no encontrado.');

  const l = await db.query(`SELECT * FROM pedido_cliente_linea WHERE pedido_id = $1 ORDER BY nombre_producto;`, [pedidoId]);

  return {
    ...p.rows[0],
    ciclo: ciclos.aCiclo(p.rows[0]),
    clienteNombre: p.rows[0].cliente_nombre,
    total: Number(p.rows[0].total),
    lineas: l.rows.map(x => ({
      productoId: x.producto_id,
      nombre: x.nombre_producto,
      referencia: x.referencia,
      cantidad: Number(x.cantidad),
      precio: Number(x.precio_unitario),
      descuento: Number(x.descuento_porcentaje) || null,
      precioLista: x.precio_lista === null ? null : Number(x.precio_lista),
      taxPercentage: x.tax_percentage === null ? null : Number(x.tax_percentage),
      subtotal: Number(x.cantidad) * Number(x.precio_unitario)
    }))
  };
}

/**
 * Factura propia + pedido marcado en UNA transacción. El bloqueo del pedido
 * hace que un doble clic o un reintento devuelva la misma factura: no usa las
 * claves pedido-N de los intentos viejos que creaban facturas en Alegra.
 * Vale el precio neto que vio el cliente; el exceso no se descuenta otra vez.
 */
async function facturar(pedidoId, usuarioId) {
  return enTransaccion(pool, async db => {
    const pedido = await detalle(pedidoId, db, { bloquear: true });
    if (pedido.estado === 'facturado') {
      if (!pedido.factura_id) throw httpError(409, 'Ese pedido ya se facturó. Falta conciliar su factura propia; no se puede crear otra.');
      const { rows: [factura] } = await db.query(`SELECT id, numero, total FROM factura WHERE id = $1`, [pedido.factura_id]);
      return { facturado: true, yaExistia: true, facturaId: factura.id, numeroFactura: factura.numero, total: Number(factura.total) };
    }
    if (pedido.estado !== 'pendiente') throw httpError(400, 'Ese pedido está rechazado.');
    if (!pedido.cliente_id) throw httpError(409, 'El pedido no tiene una ficha propia de cliente. Hay que conciliarla antes de facturar.');
    if (!pedido.lineas.length) throw httpError(400, 'Ese pedido no tiene líneas.');
    if (pedido.lineas.some(l => !l.productoId)) throw httpError(409, 'Hay líneas sin producto propio. Hay que conciliarlas antes de facturar.');
    const { rows: productos } = await db.query(`
      SELECT p.id, imp.tarifa FROM producto p LEFT JOIN impuesto imp ON imp.id = p.impuesto_id
       WHERE p.id = ANY($1::int[]) FOR SHARE OF p`, [pedido.lineas.map(l => l.productoId)]);
    const tarifas = new Map(productos.map(p => [p.id, Number(p.tarifa) || 0]));
    for (const l of pedido.lineas) {
      if (!tarifas.has(l.productoId) || tarifas.get(l.productoId) !== (Number(l.taxPercentage) || 0)) {
        throw httpError(409, `El impuesto de "${l.nombre}" cambió desde el pedido. Revise el pedido antes de facturar.`);
      }
    }
    const creada = await crearFacturaEnTransaccion(db, {
      clienteId: pedido.cliente_id,
      items: pedido.lineas.map(l => ({ productoId: l.productoId, quantity: l.cantidad,
        price: l.precio, discount: 0 })),
      observaciones: `Pedido #${pedido.id} ${pedido.origen === 'agente' ? 'del agente' : 'del portal de clientes'}${pedido.observaciones ? ` — ${pedido.observaciones}` : ''}`
    }, usuarioId, { preciosConImpuesto: true, contextoPedido: { recorridoId: pedido.ciclo_ruta_cliente_id || null, ciclo: pedido.ciclo, anticipado: Boolean(pedido.preventa_anticipada) } });
    await db.query(`
      UPDATE pedido_cliente SET estado = 'facturado', factura_id = $1, numero_factura = $2,
        resuelto_en = ${AHORA_CR_SQL}, resuelto_por = $3 WHERE id = $4`,
      [creada.id, creada.numero, usuarioId || null, pedido.id]);
    return { facturado: true, facturaId: creada.id, numeroFactura: creada.numero, total: Number(creada.total) };
  });
}

async function rechazar(pedidoId, { motivo }, usuarioId) {
  const r = await query(`
    UPDATE pedido_cliente
    SET estado = 'rechazado', motivo_rechazo = $1, resuelto_en = ${AHORA_CR_SQL}, resuelto_por = $2
    WHERE id = $3 AND estado = 'pendiente'
    RETURNING id;
  `, [String(motivo || '').trim() || 'Sin motivo indicado', usuarioId || null, pedidoId]);

  if (r.rows.length === 0) throw httpError(400, 'Ese pedido ya no está pendiente.');
  return { rechazado: true };
}

async function contarPendientes() {
  const r = await query(`SELECT COUNT(*)::int n FROM pedido_cliente WHERE estado = 'pendiente';`);
  return r.rows[0].n;
}


/**
 * Le avisa al cliente por WhatsApp en qué va su pedido.
 *
 * SALE CON BOTÓN, NO SOLO. Podría dispararse al cambiar de etapa, pero un
 * aviso automático se manda igual cuando el pedido cambió por error, cuando
 * se rechazó por falta de existencias o cuando alguien estaba probando. Acá
 * lo manda una persona que sabe qué está pasando.
 *
 * El texto se propone desde la pantalla —vive donde vive el resto del texto
 * de cara al cliente— y se puede editar antes de mandarlo.
 */
async function enviarAvisoWhatsApp(pedidoId, { telefono, mensaje, usuarioId }) {
  const pedido = await detalle(pedidoId);

  return enviarYRegistrar({
    tipo: 'pedido',
    referencia: String(pedido.id),
    clienteId: pedido.cliente_id,
    telefono,
    mensaje,
    usuarioId
  });
}

module.exports = { listarPedidos, detalle, facturar, rechazar, contarPendientes, enviarAvisoWhatsApp };
