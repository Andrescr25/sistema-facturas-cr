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

const { query, httpError } = require('./portal-clientes.auth');
const FacturacionService = require('../facturacion/facturacion.service');
const { precioSinImpuesto } = require('../catalogo-clientes/precio');

const facturacion = new FacturacionService();

async function listarPedidos({ estado = 'pendiente' } = {}) {
  const filtro = estado === 'todos' ? '' : 'WHERE p.estado = $1';
  const params = estado === 'todos' ? [] : [estado];

  const r = await query(`
    SELECT p.*, cp.nombre AS cliente_nombre, cp.usuario,
      (SELECT COUNT(*)::int FROM pedido_cliente_linea l WHERE l.pedido_id = p.id) AS lineas
    FROM pedido_cliente p
    JOIN cliente_portal cp ON cp.id = p.cliente_portal_id
    ${filtro}
    ORDER BY p.creado_en DESC
    LIMIT 200;
  `, params);

  return r.rows.map(p => ({
    id: p.id,
    clienteNombre: p.cliente_nombre,
    alegraContactId: p.alegra_contact_id,
    estado: p.estado,
    total: Number(p.total),
    lineas: p.lineas,
    observaciones: p.observaciones,
    motivoRechazo: p.motivo_rechazo,
    numeroFactura: p.numero_factura,
    creadoEn: p.creado_en,
    resueltoEn: p.resuelto_en
  }));
}

async function detalle(pedidoId) {
  const p = await query(`
    SELECT p.*, cp.nombre AS cliente_nombre
    FROM pedido_cliente p JOIN cliente_portal cp ON cp.id = p.cliente_portal_id
    WHERE p.id = $1;
  `, [pedidoId]);
  if (p.rows.length === 0) throw httpError(404, 'Pedido no encontrado.');

  const l = await query(`SELECT * FROM pedido_cliente_linea WHERE pedido_id = $1 ORDER BY nombre_producto;`, [pedidoId]);

  return {
    ...p.rows[0],
    clienteNombre: p.rows[0].cliente_nombre,
    total: Number(p.rows[0].total),
    lineas: l.rows.map(x => ({
      alegraItemId: x.alegra_item_id,
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
 * Convierte el pedido en factura de venta en Alegra.
 *
 * El precio que se manda a Alegra es SIN impuesto: Alegra guarda `price` sin
 * IVA y lo agrega según el impuesto del producto. En la línea del pedido el
 * precio está congelado CON impuesto (es lo que vio el cliente), así que acá
 * se deshace esa conversión. Mandar el precio con IVA haría que Alegra le
 * sume el IVA otra vez y la factura saldría un 13% más cara.
 */
async function facturar(pedidoId, usuarioId) {
  const pedido = await detalle(pedidoId);

  if (pedido.estado === 'facturado') {
    throw httpError(400, `Ese pedido ya se facturó (${pedido.numero_factura || pedido.alegra_invoice_id}).`);
  }
  if (pedido.estado === 'rechazado') {
    throw httpError(400, 'Ese pedido está rechazado.');
  }
  if (pedido.lineas.length === 0) {
    throw httpError(400, 'Ese pedido no tiene líneas.');
  }

  const hoy = new Date();
  const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;

  const facturaData = {
    date: fecha,
    dueDate: fecha,
    client: parseInt(pedido.alegra_contact_id, 10),
    items: pedido.lineas.map(l => {
      return {
        id: parseInt(l.alegraItemId, 10),
        reference: l.referencia || '',
        quantity: l.cantidad,
        price: precioSinImpuesto(l.precio, l.taxPercentage),
        discount: 0,
        description: ''
      };
    }),
    observations: `Pedido #${pedido.id} del portal de clientes${pedido.observaciones ? ` — ${pedido.observaciones}` : ''}`,
    status: 'open'
  };

  const resultado = await facturacion.createInvoice(facturaData);
  const creada = resultado?.data;
  if (!creada?.id) {
    throw httpError(502, 'Alegra no devolvió la factura creada.');
  }

  const numero = creada.numberTemplate?.fullNumber
    || creada.numberTemplate?.formattedNumber
    || String(creada.id);

  await query(`
    UPDATE pedido_cliente
    SET estado = 'facturado', alegra_invoice_id = $1, numero_factura = $2,
        resuelto_en = CURRENT_TIMESTAMP, resuelto_por = $3
    WHERE id = $4;
  `, [String(creada.id), numero, usuarioId || null, pedidoId]);

  return { facturado: true, alegraInvoiceId: String(creada.id), numeroFactura: numero, total: Number(creada.total) || pedido.total };
}

async function rechazar(pedidoId, { motivo }, usuarioId) {
  const r = await query(`
    UPDATE pedido_cliente
    SET estado = 'rechazado', motivo_rechazo = $1, resuelto_en = CURRENT_TIMESTAMP, resuelto_por = $2
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

module.exports = { listarPedidos, detalle, facturar, rechazar, contarPendientes };
