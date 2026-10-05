/**
 * Portal de clientes - Lo que usa el CLIENTE
 *
 * Activar la cuenta, entrar, armar el pedido y ver su historial.
 */

const ciclos = require('../rutas/documentosCiclo.service');
const {
  bcrypt, query, httpError,
  RONDAS_BCRYPT, hashToken, firmarToken
} = require('./portal-clientes.auth');

const { obtenerCarrito, bloquearCarrito } = require('./portal-clientes.carrito.service');
const avisoPedidoNuevo = require('./avisoPedidoNuevo');
const { etapaDePedido, seguimientoDePedido } = require('./seguimiento');

const { pool } = require('../../../config/database');
const { enTransaccion } = require('../../utils/transaccion');
const { AHORA_CR_SQL } = require('../../utils/fechaCR');

const MIN_PASSWORD = 8;

/**
 * El pedido con su etapa y su línea de tiempo, para que el cliente vea en qué
 * va. El alistado sale de la factura propia, ligada por pedido.factura_id.
 * Una factura anulada se ve como "No procesado".
 */
const JOIN_BODEGA = `LEFT JOIN factura f ON f.id = p.factura_id`;
const COLUMNAS_BODEGA = `
  CASE WHEN f.estado = 'anulada' THEN 'anulada' ELSE f.estado_bodega END AS estado_bodega,
  f.bodega_procesado_en
`;

function conSeguimiento(fila, extra = {}) {
  const datos = {
    estado: fila.estado,
    estadoBodega: fila.estado_bodega || null,
    creadoEn: fila.creado_en,
    resueltoEn: fila.resuelto_en,
    bodegaProcesadoEn: fila.bodega_procesado_en
  };
  return {
    etapa: etapaDePedido(datos),
    seguimiento: seguimientoDePedido(datos),
    ...extra
  };
}

/**
 * Datos de la invitación, para que la pantalla de activación pueda saludar
 * al cliente por su nombre antes de pedirle nada.
 *
 * NO SE SUGIERE NINGÚN USUARIO, a propósito.
 *
 * Antes se pre-cargaba la cédula del contacto. La idea era ahorrarle un
 * campo, pero la cédula que hay en Alegra muchas veces no es real: hay
 * clientes cargados con "100000000" y parecidos, porque en el mostrador nadie
 * la pide. Pre-cargar eso lleva al cliente a quedarse con un usuario que no
 * es suyo, que no va a recordar, y que en el caso de los rellenos repetidos
 * choca contra el de otro (el usuario es único). Que lo elija él.
 *
 * `identificacion` ya no se consulta acá: no se usaba para nada más.
 */
async function verInvitacion(token) {
  const r = await query(`
    SELECT i.*, cp.nombre, cp.usuario AS usuario_actual, cp.password_hash
    FROM cliente_invitacion i
    JOIN cliente_portal cp ON cp.cliente_id = i.cliente_id
    WHERE i.token_hash = $1;
  `, [hashToken(token)]);

  const inv = r.rows[0];
  if (!inv) throw httpError(404, 'Ese enlace no es válido.');
  if (inv.usado_en) throw httpError(400, 'Ese enlace ya se usó. Solicite uno nuevo.');
  if (new Date(inv.expira_en) <= new Date()) throw httpError(400, 'Ese enlace venció. Solicite uno nuevo.');

  return { nombre: inv.nombre, yaActivada: Boolean(inv.password_hash) };
}

/**
 * Activa la cuenta: el cliente elige usuario y contraseña.
 *
 * La invitación se marca usada DENTRO de la misma operación que escribe la
 * contraseña, para que un enlace no pueda activar dos cuentas si se abre dos
 * veces a la vez.
 */
async function activar(token, { usuario, password }) {
  const nombreUsuario = String(usuario || '').trim().toLowerCase();
  if (nombreUsuario.length < 4) throw httpError(400, 'El usuario debe tener al menos 4 caracteres.');
  if (String(password || '').length < MIN_PASSWORD) throw httpError(400, `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
  const hash = await bcrypt.hash(String(password), RONDAS_BCRYPT);
  try {
    return await enTransaccion(pool, async db => {
      const { rows: [inv] } = await db.query(`
        SELECT i.id AS invitacion_id, cp.id AS cuenta_id, cp.activo, c.activo AS cliente_activo
          FROM cliente_invitacion i
          JOIN cliente_portal cp ON cp.cliente_id = i.cliente_id
          JOIN cliente c ON c.id = cp.cliente_id
         WHERE i.token_hash = $1 AND i.usado_en IS NULL AND i.expira_en > ${AHORA_CR_SQL}
         FOR UPDATE OF i, cp`, [hashToken(token)]);
      if (!inv) throw httpError(400, 'Ese enlace no es válido, ya se usó o venció.');
      if (!inv.activo || !inv.cliente_activo) throw httpError(403, 'Esta cuenta está desactivada. Comuníquese con nosotros.');
      const tomado = await db.query(`SELECT 1 FROM cliente_portal WHERE LOWER(usuario) = $1 AND id <> $2`, [nombreUsuario, inv.cuenta_id]);
      if (tomado.rows.length) throw httpError(400, 'Ese usuario ya está tomado. Elija otro.');
      const { rows: [cuenta] } = await db.query(`
        UPDATE cliente_portal SET usuario = $1, password_hash = $2, activado_en = ${AHORA_CR_SQL}
         WHERE id = $3 RETURNING *`, [nombreUsuario, hash, inv.cuenta_id]);
      await db.query(`UPDATE cliente_invitacion SET usado_en = ${AHORA_CR_SQL} WHERE id = $1`, [inv.invitacion_id]);
      return { token: firmarToken(cuenta), cliente: mapCuenta(cuenta) };
    });
  } catch (e) {
    if (e.code === '23505') throw httpError(400, 'Ese usuario ya está tomado. Elija otro.');
    throw e;
  }
}

function mapCuenta(row) {
  return { id: row.id, nombre: row.nombre, usuario: row.usuario, clienteId: row.cliente_id };
}

async function entrar({ usuario, password }) {
  if (!usuario || !password) throw httpError(400, 'Usuario y contraseña son obligatorios.');

  const r = await query(`SELECT * FROM cliente_portal WHERE LOWER(usuario) = LOWER($1);`, [String(usuario).trim()]);
  const cuenta = r.rows[0];

  // Mismo mensaje y costo parecido exista o no la cuenta — si respondiera
  // distinto se podría averiguar qué usuarios existen.
  const hash = cuenta?.password_hash || '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const coincide = await bcrypt.compare(String(password), hash);

  if (!cuenta || !coincide || !cuenta.activo || !cuenta.password_hash) {
    throw httpError(401, 'Usuario o contraseña incorrectos.');
  }

  await query(`UPDATE cliente_portal SET ultimo_ingreso = CURRENT_TIMESTAMP WHERE id = $1;`, [cuenta.id]);
  return { token: firmarToken(cuenta), cliente: mapCuenta(cuenta) };
}

// ==================== PEDIDOS ====================


/**
 * Convierte el carrito del cliente en un pedido.
 *
 * Las líneas salen del CARRITO GUARDADO EN EL SERVIDOR, no de la petición.
 * Antes llegaban en el cuerpo y había que ignorar el precio que mandaran;
 * ahora el navegador ni siquiera participa en decidir qué se pide: solo pudo
 * haber agregado productos al carrito, uno por uno, cada uno validado.
 *
 * El precio se congela ACÁ, que es el momento del compromiso — el carrito a
 * propósito no guarda precios (ver add_carrito_cliente.sql).
 */
async function crearPedido(cuentaId, { observaciones, cicloId, preventaToken } = {}) {
  const resultado = await enTransaccion(pool, async db => {
    const { rows: [cuenta] } = await db.query(`
      SELECT cp.*, c.nombre AS nombre, c.activo AS cliente_activo
        FROM cliente_portal cp LEFT JOIN cliente c ON c.id = cp.cliente_id
       WHERE cp.id = $1 AND cp.activo = TRUE FOR UPDATE OF cp`, [cuentaId]);
    if (!cuenta || !cuenta.cliente_id || !cuenta.cliente_activo) throw httpError(403, 'Su cuenta está desactivada.');
    // La semana del enlace se comprueba dentro de la misma transacción: si
    // cerró el ciclo o cambió la cuenta, se conserva todo el carrito.
    const contexto = preventaToken !== undefined
      ? await require('./preventa.service').validarEn(db, cuenta, preventaToken, cicloId)
      : await ciclos.validarEn(db, cuenta.cliente_id, cicloId);
    await bloquearCarrito(db, cuentaId);
    const carrito = await obtenerCarrito(cuentaId, db, { bloquearProductos: true });
    if (!carrito.lineas.length) throw httpError(400, carrito.noDisponibles.length
      ? 'Los productos del carrito ya no están disponibles.' : 'El carrito está vacío.');
    // Un producto que se ocultó o se dio de baja después de agregarlo NO
    // bloquea el envío. El panel del pedido solo dibuja `lineas`, con su total:
    // el cliente manda exactamente lo que ve. Frenarlo acá lo dejaba con un
    // error sobre un producto que no puede ver ni quitar, y la única salida
    // era vaciar el carrito entero.
    const { rows: [pedido] } = await db.query(`
      INSERT INTO pedido_cliente (cliente_portal_id, cliente_id, cliente_nombre, total, observaciones, ciclo_ruta_cliente_id, preventa_anticipada, creado_en)
      VALUES ($1, $2, $3, $4, $5, $6, $7, ${AHORA_CR_SQL}) RETURNING *`,
      [cuenta.id, cuenta.cliente_id, cuenta.nombre, carrito.total, observaciones || null, contexto?.recorridoId || null, contexto?.estado === 'preventa']);
    const tasas = await tasasDe(carrito.lineas.map(l => l.producto.id), db);
    const filas = carrito.lineas.map((_, idx) => `(${Array.from({ length: 9 }, (_, i) => '$' + (idx * 9 + i + 1)).join(', ')})`).join(', ');
    const valores = carrito.lineas.flatMap(({ producto, cantidad }) => [
      pedido.id, producto.id, producto.nombre, producto.referencia, cantidad,
      producto.precio, tasas.get(producto.id) ?? 0, producto.descuento || 0,
      producto.precioLista ?? producto.precio
    ]);
    await db.query(`
      INSERT INTO pedido_cliente_linea (pedido_id, producto_id, nombre_producto, referencia,
        cantidad, precio_unitario, tax_percentage, descuento_porcentaje, precio_lista)
      VALUES ${filas}`, valores);
    await db.query(`DELETE FROM carrito_cliente_linea WHERE cliente_portal_id = $1`, [cuentaId]);
    await db.query(`UPDATE carrito_cliente SET actualizado_en = ${AHORA_CR_SQL} WHERE cliente_portal_id = $1`, [cuentaId]);
    return { pedido, cuenta, lineas: carrito.lineas.length, contexto };
  });
  const { pedido, cuenta, lineas, contexto } = resultado;
  // Solo después del COMMIT. Un aviso nunca anuncia un pedido a medias.
  avisoPedidoNuevo.avisar({
    cliente: cuenta.nombre, pedidoId: pedido.id, lineas,
    total: Number(pedido.total), observaciones: pedido.observaciones
  }).catch(() => {});
  return { id: pedido.id, total: Number(pedido.total), lineas, estado: pedido.estado, creadoEn: pedido.creado_en, ciclo: contexto?.ciclo || null, anticipado: pedido.preventa_anticipada };
}

/** Tarifa de cada producto propio, sobre la conexión del pedido. */
async function tasasDe(productoIds, db) {
  const { rows } = await db.query(`
    SELECT p.id, imp.tarifa FROM producto p LEFT JOIN impuesto imp ON imp.id = p.impuesto_id
     WHERE p.id = ANY($1::int[])`, [productoIds]);
  return new Map(rows.map(p => [p.id, Number(p.tarifa) || 0]));
}

async function misPedidos(clienteId) {
  const r = await query(`
    SELECT p.*, ${ciclos.COLUMNAS_CICLO}, ${COLUMNAS_BODEGA},
      (SELECT COUNT(*)::int FROM pedido_cliente_linea l WHERE l.pedido_id = p.id) AS lineas
    FROM pedido_cliente p
    ${JOIN_BODEGA}
    ${ciclos.JOIN_CICLO('p')}
    WHERE p.cliente_portal_id = $1
    ORDER BY p.creado_en DESC
    LIMIT 50;
  `, [clienteId]);

  return r.rows.map(p => conSeguimiento(p, {
    id: p.id,
    estado: p.estado,
    ciclo: ciclos.aCiclo(p), anticipado: p.preventa_anticipada,
    total: Number(p.total),
    lineas: p.lineas,
    numeroFactura: p.numero_factura,
    motivoRechazo: p.motivo_rechazo,
    creadoEn: p.creado_en
  }));
}

async function detallePedido(clienteId, pedidoId) {
  const p = await query(`
    SELECT p.*, ${ciclos.COLUMNAS_CICLO}, ${COLUMNAS_BODEGA}
    FROM pedido_cliente p
    ${JOIN_BODEGA}
    ${ciclos.JOIN_CICLO('p')}
    WHERE p.id = $1 AND p.cliente_portal_id = $2;
  `, [pedidoId, clienteId]);
  if (p.rows.length === 0) throw httpError(404, 'Pedido no encontrado.');

  const l = await query(`SELECT * FROM pedido_cliente_linea WHERE pedido_id = $1 ORDER BY nombre_producto;`, [pedidoId]);
  return {
    ...conSeguimiento(p.rows[0]),
    id: p.rows[0].id,
    ciclo: ciclos.aCiclo(p.rows[0]), anticipado: p.rows[0].preventa_anticipada,
    estado: p.rows[0].estado,
    total: Number(p.rows[0].total),
    numeroFactura: p.rows[0].numero_factura,
    motivoRechazo: p.rows[0].motivo_rechazo,
    creadoEn: p.rows[0].creado_en,
    observaciones: p.rows[0].observaciones,
    lineas: l.rows.map(x => ({
      nombre: x.nombre_producto,
      referencia: x.referencia,
      cantidad: Number(x.cantidad),
      precio: Number(x.precio_unitario),
      descuento: Number(x.descuento_porcentaje) || null,
      precioLista: x.precio_lista === null ? null : Number(x.precio_lista),
      subtotal: Number(x.cantidad) * Number(x.precio_unitario)
    }))
  };
}

module.exports = { verInvitacion, activar, entrar, crearPedido, misPedidos, detallePedido, mapCuenta };
