/**
 * Portal de clientes - Lo que usa el CLIENTE
 *
 * Activar la cuenta, entrar, armar el pedido y ver su historial.
 */

const {
  bcrypt, query, httpError,
  RONDAS_BCRYPT, hashToken, firmarToken
} = require('./portal-clientes.auth');

const { obtenerCarrito, vaciarCarrito } = require('./portal-clientes.carrito.service');

const MIN_PASSWORD = 8;

/**
 * Datos de la invitación, para que la pantalla de activación pueda saludar
 * al cliente por su nombre y sugerirle un usuario antes de pedirle nada.
 */
async function verInvitacion(token) {
  const r = await query(`
    SELECT i.*, cp.nombre, cp.identificacion, cp.usuario AS usuario_actual, cp.password_hash
    FROM cliente_invitacion i
    JOIN cliente_portal cp ON cp.alegra_contact_id = i.alegra_contact_id
    WHERE i.token_hash = $1;
  `, [hashToken(token)]);

  const inv = r.rows[0];
  if (!inv) throw httpError(404, 'Ese enlace no es válido.');
  if (inv.usado_en) throw httpError(400, 'Ese enlace ya se usó. Solicite uno nuevo.');
  if (new Date(inv.expira_en) <= new Date()) throw httpError(400, 'Ese enlace venció. Solicite uno nuevo.');

  // La cédula es la sugerencia natural de usuario, pero hay clientes que la
  // comparten (3 de 202): si ya está tomada no se sugiere, y el cliente elige.
  let sugerencia = null;
  if (inv.identificacion) {
    const tomado = await query(`SELECT 1 FROM cliente_portal WHERE LOWER(usuario) = LOWER($1);`, [inv.identificacion]);
    if (tomado.rows.length === 0) sugerencia = String(inv.identificacion).trim();
  }

  return { nombre: inv.nombre, usuarioSugerido: sugerencia, yaActivada: Boolean(inv.password_hash) };
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
  if (String(password || '').length < MIN_PASSWORD) {
    throw httpError(400, `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
  }

  const r = await query(`
    SELECT i.id AS invitacion_id, i.alegra_contact_id, cp.id AS cuenta_id, cp.nombre, cp.activo
    FROM cliente_invitacion i
    JOIN cliente_portal cp ON cp.alegra_contact_id = i.alegra_contact_id
    WHERE i.token_hash = $1 AND i.usado_en IS NULL AND i.expira_en > CURRENT_TIMESTAMP;
  `, [hashToken(token)]);

  const inv = r.rows[0];
  if (!inv) throw httpError(400, 'Ese enlace no es válido, ya se usó o venció.');
  if (!inv.activo) throw httpError(403, 'Esta cuenta está desactivada. Comuníquese con nosotros.');

  const tomado = await query(
    `SELECT 1 FROM cliente_portal WHERE LOWER(usuario) = $1 AND id <> $2;`,
    [nombreUsuario, inv.cuenta_id]
  );
  if (tomado.rows.length > 0) throw httpError(400, 'Ese usuario ya está tomado. Elija otro.');

  const hash = await bcrypt.hash(String(password), RONDAS_BCRYPT);

  // El UPDATE de la invitación lleva la condición usado_en IS NULL: si dos
  // pedidos llegan a la vez, solo uno la marca y el otro no encuentra fila.
  const marcada = await query(
    `UPDATE cliente_invitacion SET usado_en = CURRENT_TIMESTAMP
     WHERE id = $1 AND usado_en IS NULL RETURNING id;`,
    [inv.invitacion_id]
  );
  if (marcada.rows.length === 0) throw httpError(400, 'Ese enlace ya se usó.');

  const cuenta = await query(`
    UPDATE cliente_portal
    SET usuario = $1, password_hash = $2, activado_en = CURRENT_TIMESTAMP
    WHERE id = $3
    RETURNING *;
  `, [nombreUsuario, hash, inv.cuenta_id]);

  return { token: firmarToken(cuenta.rows[0]), cliente: mapCuenta(cuenta.rows[0]) };
}

function mapCuenta(row) {
  return { id: row.id, nombre: row.nombre, usuario: row.usuario, contacto: row.alegra_contact_id };
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
async function crearPedido(clienteId, { observaciones } = {}) {
  const cuentaRes = await query(`SELECT * FROM cliente_portal WHERE id = $1 AND activo = TRUE;`, [clienteId]);
  const cuenta = cuentaRes.rows[0];
  if (!cuenta) throw httpError(403, 'Su cuenta está desactivada.');

  const carrito = await obtenerCarrito(clienteId);

  if (carrito.lineas.length === 0) {
    throw httpError(400, carrito.noDisponibles.length > 0
      ? 'Los productos del carrito ya no están disponibles.'
      : 'El carrito está vacío.');
  }

  const total = carrito.lineas.reduce((s, l) => s + l.cantidad * l.producto.precio, 0);

  const pedidoRes = await query(`
    INSERT INTO pedido_cliente (cliente_portal_id, alegra_contact_id, total, observaciones)
    VALUES ($1, $2, $3::numeric, $4)
    RETURNING *;
  `, [cuenta.id, cuenta.alegra_contact_id, Math.round(total * 100) / 100, observaciones || null]);
  const pedido = pedidoRes.rows[0];

  for (const { producto, cantidad } of carrito.lineas) {
    // precioLista solo viene cuando hubo rebaja; sin oferta, el precio de
    // lista ES el precio, y guardar null ahí perdería el dato.
    const lista = producto.precioLista ?? producto.precio;
    await query(`
      INSERT INTO pedido_cliente_linea
        (pedido_id, alegra_item_id, nombre_producto, referencia, cantidad,
         precio_unitario, tax_percentage, descuento_porcentaje, precio_lista)
      VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric, $7::numeric, $8::numeric, $9::numeric);
    `, [
      pedido.id, producto.id, producto.nombre, producto.referencia, cantidad,
      producto.precio, await tasaDe(producto.id), producto.descuento || 0, lista
    ]);
  }

  // El carrito se vacía recién cuando el pedido ya quedó guardado: si algo
  // falla antes, el cliente conserva lo que armó.
  await vaciarCarrito(clienteId);

  return { id: pedido.id, total: Number(pedido.total), lineas: carrito.lineas.length, estado: pedido.estado };
}

/**
 * La tasa de impuesto del producto. Hace falta al facturar para deshacer el
 * IVA y mandarle a Alegra el precio sin impuesto; el carrito no la expone
 * porque al cliente no le dice nada.
 */
async function tasaDe(alegraItemId) {
  const r = await query(`SELECT tax_percentage FROM alegra_products_cache WHERE alegra_id = $1;`, [String(alegraItemId)]);
  const t = r.rows[0]?.tax_percentage;
  return t === null || t === undefined ? 0 : Number(t);
}

async function misPedidos(clienteId) {
  const r = await query(`
    SELECT p.*,
      (SELECT COUNT(*)::int FROM pedido_cliente_linea l WHERE l.pedido_id = p.id) AS lineas
    FROM pedido_cliente p
    WHERE p.cliente_portal_id = $1
    ORDER BY p.creado_en DESC
    LIMIT 50;
  `, [clienteId]);

  return r.rows.map(p => ({
    id: p.id,
    estado: p.estado,
    total: Number(p.total),
    lineas: p.lineas,
    numeroFactura: p.numero_factura,
    motivoRechazo: p.motivo_rechazo,
    creadoEn: p.creado_en
  }));
}

async function detallePedido(clienteId, pedidoId) {
  const p = await query(`SELECT * FROM pedido_cliente WHERE id = $1 AND cliente_portal_id = $2;`, [pedidoId, clienteId]);
  if (p.rows.length === 0) throw httpError(404, 'Pedido no encontrado.');

  const l = await query(`SELECT * FROM pedido_cliente_linea WHERE pedido_id = $1 ORDER BY nombre_producto;`, [pedidoId]);
  return {
    id: p.rows[0].id,
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
