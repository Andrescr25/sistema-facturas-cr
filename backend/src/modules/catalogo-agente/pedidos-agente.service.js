/**
 * Pedidos del agente sin cuenta de portal. La ficha es cliente.id y las
 * líneas usan producto.id. Precio, IVA, nombre y descuentos salen del maestro
 * del servidor: no de la tablet, que puede llevar días sin actualizarse.
 *
 * CABECERA Y LÍNEAS SON UNA TRANSACCIÓN. La clave única reconoce reenvíos,
 * incluso simultáneos; una respuesta nunca confirma un pedido a medias.
 *
 * COMPATIBILIDAD ACOTADA: una cola offline antigua puede enviar los campos
 * alegraContactId / alegraItemId. Solo ESOS campos se traducen por alegra_id.
 * Nunca se intenta primero como id propio ni se mezclan ambos contratos.
 * Se conserva la misma clave, y un pedido ya recibido devuelve el original.
 */
const ciclos = require('../rutas/documentosCiclo.service');
const { pool, query } = require('../../../config/database');
const { idValido, httpError } = require('../../utils/validacion');
const { enTransaccion } = require('../../utils/transaccion');
const { AHORA_CR_SQL } = require('../../utils/fechaCR');
const { precioConImpuesto } = require('../catalogo-clientes/precio');
const { mapaVigentesPropios, aplicarDescuento } = require('../../utils/descuentosExceso');

/** Contrato propio: { clienteId, lineas: [{ productoId, cantidad }], claveIdempotencia }. */
async function crear(usuarioId, { clienteId, alegraContactId, lineas, observaciones, claveIdempotencia, cicloId }) {
  if (!claveIdempotencia) throw httpError(400, 'Falta la clave del pedido. Sin ella un reenvío crearía un pedido duplicado.');
  const clave = String(claveIdempotencia).trim();
  if (!clave || clave.length > 120) throw httpError(400, 'La clave del pedido no es válida.');
  if (!Array.isArray(lineas) || !lineas.length) throw httpError(400, 'El pedido no tiene productos.');
  if (clienteId != null && alegraContactId != null) throw httpError(400, 'El pedido mezcla ids propios y antiguos. Actualice la tablet.');
  const antiguo = clienteId == null;
  const clienteBuscado = antiguo ? String(alegraContactId || '').trim() : idValido(clienteId);
  if (!clienteBuscado) throw httpError(400, 'Falta el cliente del pedido.');
  return enTransaccion(pool, async db => {
    const previo = await db.query('SELECT * FROM pedido_cliente WHERE clave_idempotencia = $1 FOR UPDATE', [clave]);
    if (previo.rows.length) return { pedido: previo.rows[0], yaExistia: true };
    const { rows: [cliente] } = await db.query(`
      SELECT id, nombre, activo FROM cliente WHERE ${antiguo ? 'alegra_id' : 'id'} = $1 FOR SHARE`, [clienteBuscado]);
    if (!cliente) throw httpError(409, 'Falta conciliar la ficha propia de ese cliente. El pedido sigue pendiente en la tablet.');
    if (!cliente.activo) throw httpError(409, 'Ese cliente está inactivo. Revise el pedido antes de enviarlo.');
    const contexto = await ciclos.validarEn(db, cliente.id, cicloId);
    const porProducto = new Map();
    for (const l of lineas) {
      if (!l || typeof l !== 'object' || Array.isArray(l)) throw httpError(400, 'Producto o cantidad inválidos.');
      if (antiguo ? l.productoId != null : l.alegraItemId != null) {
        throw httpError(400, 'El pedido mezcla ids propios y antiguos. Actualice la tablet.');
      }
      const id = antiguo ? String(l.alegraItemId || '').trim() : String(idValido(l.productoId));
      const cantidad = Number(l.cantidad);
      if (!id || !Number.isFinite(cantidad)) throw httpError(400, 'Producto o cantidad inválidos.');
      const n = Math.max(0, Math.floor(cantidad));
      if (n) porProducto.set(id, (porProducto.get(id) || 0) + n);
    }
    if (!porProducto.size) throw httpError(400, 'El pedido no tiene cantidades válidas.');
    const ids = [...porProducto.keys()];
    const { rows } = await db.query(`
      SELECT p.id AS producto_id, p.alegra_id, p.nombre, p.referencia,
             p.precio_sin_iva, imp.tarifa
      FROM producto p LEFT JOIN impuesto imp ON imp.id = p.impuesto_id
      WHERE ${antiguo ? 'p.alegra_id = ANY($1::varchar[])' : 'p.id = ANY($1::int[])'}
        AND p.activo = TRUE AND p.oculto = FALSE AND p.precio_sin_iva > 0
      FOR SHARE OF p`, [ids]);
    const encontrados = new Map(rows.map(p => [String(antiguo ? p.alegra_id : p.producto_id), p]));
    const noDisponibles = ids.filter(id => !encontrados.has(id));
    if (!encontrados.size) throw httpError(400, 'Ninguno de los productos del pedido está disponible.');
    const descuentos = await mapaVigentesPropios(db);
    const armadas = [];
    for (const [id, cantidad] of porProducto) {
      const p = encontrados.get(id);
      if (!p) continue; // se informa sin descartar todo el pedido
      const precioLista = precioConImpuesto(p.precio_sin_iva, p.tarifa);
      const descuento = descuentos.get(String(p.producto_id)) || 0;
      armadas.push({ productoId: p.producto_id, alegraItemId: antiguo ? p.alegra_id : null,
        nombre: p.nombre, referencia: p.referencia || '', cantidad,
        precio: aplicarDescuento(precioLista, descuento), precioLista, descuento,
        taxPercentage: Number(p.tarifa) || 0 });
    }
    const total = Math.round(armadas.reduce((s,l) => s+l.cantidad*l.precio,0)*100)/100;
    // ON CONFLICT espera al ganador. Su COMMIT incluye TODAS las líneas;
    // si falla, su ROLLBACK libera la clave y este envío puede guardarse.
    const { rows: creados } = await db.query(`
      INSERT INTO pedido_cliente (cliente_portal_id, cliente_id, alegra_contact_id,
        cliente_nombre, origen, creado_por_usuario_id, total, observaciones, clave_idempotencia, ciclo_ruta_cliente_id, creado_en)
      VALUES (NULL, $1, $2, $3, 'agente', $4, $5, $6, $7, $8, ${AHORA_CR_SQL})
      ON CONFLICT (clave_idempotencia) WHERE clave_idempotencia IS NOT NULL DO NOTHING
      RETURNING *`, [cliente.id, antiguo ? clienteBuscado : null, cliente.nombre,
        usuarioId || null, total, observaciones || null, clave, contexto?.recorridoId || null]);
    if (!creados.length) {
      const ganador = await db.query('SELECT * FROM pedido_cliente WHERE clave_idempotencia = $1', [clave]);
      return { pedido: ganador.rows[0], yaExistia: true };
    }
    const pedido = creados[0];
    const columnas = 10;
    const filas = armadas.map((_,idx) => `(${Array.from({length:columnas}, (_,i) => '$'+(idx*columnas+i+1)).join(', ')})`).join(', ');
    const valores = armadas.flatMap(l => [pedido.id, l.alegraItemId, l.productoId, l.nombre,
      l.referencia, l.cantidad, l.precio, l.taxPercentage, l.descuento, l.precioLista]);
    await db.query(`INSERT INTO pedido_cliente_linea (pedido_id, alegra_item_id, producto_id,
      nombre_producto, referencia, cantidad, precio_unitario, tax_percentage,
      descuento_porcentaje, precio_lista) VALUES ${filas}`, valores);
    return { pedido, yaExistia: false, noDisponibles };
  });
}

/**
 * El dispositivo reporta cómo está: cuántos pedidos le quedan sin mandar y
 * desde cuándo.
 *
 * POR QUÉ NO ALCANZA CON MIRAR LOS PEDIDOS QUE LLEGARON
 * Un pedido atascado en una tablet, por definición, NO llegó: no hay nada que
 * mirar en la base. La única forma de enterarse es que el propio dispositivo
 * lo cuente cuando puede hablar. Y si no puede, su silencio es el aviso.
 */
async function reportarEstado(usuarioId, { dispositivoId, usuarioNombre, pedidosPendientes, pedidoMasViejo }) {
  if (!dispositivoId) throw httpError(400, 'Falta el identificador del dispositivo.');

  const r = await query(`
    INSERT INTO dispositivo_agente
      (id, usuario_id, usuario_nombre, pedidos_pendientes, pedido_mas_viejo, ultimo_contacto)
    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO UPDATE SET
      usuario_id = EXCLUDED.usuario_id,
      usuario_nombre = EXCLUDED.usuario_nombre,
      pedidos_pendientes = EXCLUDED.pedidos_pendientes,
      pedido_mas_viejo = EXCLUDED.pedido_mas_viejo,
      ultimo_contacto = CURRENT_TIMESTAMP
    RETURNING *;
  `, [String(dispositivoId), usuarioId || null, usuarioNombre || null,
      Math.max(0, parseInt(pedidosPendientes, 10) || 0),
      pedidoMasViejo ? new Date(pedidoMasViejo) : null]);

  return r.rows[0];
}

/**
 * Los dispositivos, para la pantalla de la casa.
 *
 * `alerta` es lo que hay que mirar. Se calcula acá y no en la pantalla para
 * que la regla viva en un solo lugar:
 *
 *   pendientes    reportó pedidos sin enviar la última vez que habló
 *   sin_noticias  hace más de 3 horas que no se comunica Y tenía pendientes
 *
 * Tres horas es lo que puede durar una ruta sin señal en la zona; menos daría
 * avisos que no significan nada y la gente dejaría de mirarlos.
 */
async function listarDispositivos() {
  const r = await query(`
    SELECT d.*,
      EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - d.ultimo_contacto)) / 60 AS minutos_sin_contacto
    FROM dispositivo_agente d
    ORDER BY d.pedidos_pendientes DESC, d.ultimo_contacto ASC;
  `);

  return r.rows.map(d => {
    const minutos = Math.round(Number(d.minutos_sin_contacto) || 0);
    const pendientes = Number(d.pedidos_pendientes) || 0;
    let alerta = null;
    if (pendientes > 0 && minutos > 180) alerta = 'sin_noticias';
    else if (pendientes > 0) alerta = 'pendientes';
    return {
      id: d.id,
      usuarioNombre: d.usuario_nombre,
      pedidosPendientes: pendientes,
      pedidoMasViejo: d.pedido_mas_viejo,
      ultimoContacto: d.ultimo_contacto,
      minutosSinContacto: minutos,
      alerta
    };
  });
}

module.exports = { crear, reportarEstado, listarDispositivos };
