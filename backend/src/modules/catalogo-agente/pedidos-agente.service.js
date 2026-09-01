/**
 * Pedidos que levanta el AGENTE en la calle, junto al cliente.
 *
 * QUÉ CAMBIA RESPECTO DEL PORTAL
 * En el portal el cliente entra con su cuenta y el carrito vive en el
 * servidor. Acá no hay nada de eso: el agente trabaja sin señal, arma el
 * pedido en su dispositivo y lo manda cuando puede. Solo 5 de los 239
 * clientes tienen cuenta de portal, así que el pedido se guarda contra el
 * contacto de Alegra, sin exigir usuario.
 *
 * LO QUE HACE QUE NO SE PIERDAN NI SE DUPLIQUEN PEDIDOS
 *
 * El dispositivo manda una CLAVE con cada pedido. Si la respuesta no llega
 * —que en la calle es lo normal— el dispositivo no sabe si entró, y reenvía.
 * Con la clave, el servidor reconoce que ya lo tiene y devuelve EL MISMO
 * pedido en vez de crear otro que después alguien facturaría dos veces.
 *
 * Quien decide no es este código sino un índice UNIQUE en la base: una
 * comprobación en JavaScript se puede olvidar o competir consigo misma
 * cuando dos envíos llegan a la vez. La base no.
 *
 * EL PRECIO SE CONGELA ACÁ, NO LLEGA DEL DISPOSITIVO
 * El navegador manda qué productos y cuántos; el precio lo pone el servidor
 * desde el catálogo. Si viajara en la petición, cualquiera podría pedir a
 * precio 1. Y como el dispositivo puede tener el catálogo de hace días, el
 * precio del pedido es el de HOY, no el que el agente vio en la tablet.
 */

const { query } = require('../../../config/database');
const { precioConImpuesto } = require('../catalogo-clientes/precio');
const { mapaVigentes, aplicarDescuento } = require('../../utils/descuentosExceso');

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/**
 * Crea el pedido. `lineas` es [{ alegraItemId, cantidad }] — nada de precios.
 *
 * Devuelve `{ pedido, yaExistia }`. `yaExistia` en true significa que esta
 * clave ya se había recibido: el dispositivo puede borrar su copia local
 * tranquilo, el pedido está guardado.
 */
async function crear(usuarioId, { alegraContactId, clienteNombre, lineas, observaciones, claveIdempotencia }) {
  if (!alegraContactId) throw httpError(400, 'Falta el cliente del pedido.');
  if (!Array.isArray(lineas) || lineas.length === 0) throw httpError(400, 'El pedido no tiene productos.');
  if (!claveIdempotencia) {
    // Sin clave no se puede distinguir un reenvío de un pedido nuevo, y en la
    // calle los reenvíos son inevitables. Se exige en vez de aceptarla vacía.
    throw httpError(400, 'Falta la clave del pedido. Sin ella un reenvío crearía un pedido duplicado.');
  }

  // Un reenvío de algo que ya entró: se devuelve lo mismo, sin crear nada.
  const previo = await query(
    `SELECT * FROM pedido_cliente WHERE clave_idempotencia = $1;`, [claveIdempotencia]
  );
  if (previo.rows.length > 0) {
    return { pedido: previo.rows[0], yaExistia: true };
  }

  // Normalizar y sumar cantidades repetidas del mismo producto: el agente
  // puede agregar el mismo dos veces y eso es UNA línea con la suma, no dos.
  const porProducto = new Map();
  for (const l of lineas) {
    const id = String(l.alegraItemId || '').trim();
    const cantidad = Math.max(0, Math.floor(Number(l.cantidad) || 0));
    if (!id || cantidad === 0) continue;
    porProducto.set(id, (porProducto.get(id) || 0) + cantidad);
  }
  if (porProducto.size === 0) throw httpError(400, 'El pedido no tiene cantidades válidas.');

  // El precio de HOY, del servidor. El dispositivo puede traer un catálogo de
  // hace días y el pedido no debe quedar con precios viejos.
  const ids = [...porProducto.keys()];
  const productos = await query(`
    SELECT alegra_id, name, reference, price, tax_percentage
    FROM alegra_products_cache
    WHERE alegra_id = ANY($1::varchar[])
      AND status = 'active' AND hidden_locally = FALSE AND price > 0;
  `, [ids]);

  const descuentos = await mapaVigentes();
  const encontrados = new Map(productos.rows.map(p => [String(p.alegra_id), p]));

  const noDisponibles = ids.filter(id => !encontrados.has(id));
  if (encontrados.size === 0) {
    throw httpError(400, 'Ninguno de los productos del pedido está disponible.');
  }

  const armadas = [];
  for (const [id, cantidad] of porProducto) {
    const p = encontrados.get(id);
    if (!p) continue;   // se informa aparte, no se pierde el pedido entero
    const precioLista = precioConImpuesto(p.price, p.tax_percentage);
    const descuento = descuentos.get(id) || 0;
    armadas.push({
      alegraItemId: id,
      nombre: p.name,
      referencia: p.reference || '',
      cantidad,
      precio: aplicarDescuento(precioLista, descuento),
      precioLista,
      descuento,
      taxPercentage: Number(p.tax_percentage) || 0
    });
  }

  const total = armadas.reduce((s, l) => s + l.cantidad * l.precio, 0);

  let pedido;
  try {
    const r = await query(`
      INSERT INTO pedido_cliente
        (cliente_portal_id, alegra_contact_id, cliente_nombre, origen,
         creado_por_usuario_id, total, observaciones, clave_idempotencia)
      VALUES (NULL, $1, $2, 'agente', $3, $4::numeric, $5, $6)
      RETURNING *;
    `, [String(alegraContactId), clienteNombre || null, usuarioId || null,
        Math.round(total * 100) / 100, observaciones || null, claveIdempotencia]);
    pedido = r.rows[0];
  } catch (error) {
    // Dos envíos de la misma clave que llegan a la vez: el índice UNIQUE deja
    // pasar uno solo. El otro no es un error para el agente — su pedido SÍ
    // está guardado — así que se devuelve el que ganó.
    if (error.code === '23505') {
      const ganador = await query(
        `SELECT * FROM pedido_cliente WHERE clave_idempotencia = $1;`, [claveIdempotencia]
      );
      if (ganador.rows.length > 0) return { pedido: ganador.rows[0], yaExistia: true };
    }
    throw error;
  }

  const COLUMNAS = 9;
  const filas = armadas.map((_, idx) => {
    const b = idx * COLUMNAS;
    const casts = ['', '', '', '', '::numeric', '::numeric', '::numeric', '::numeric', '::numeric'];
    return `(${casts.map((c, i) => `$${b + i + 1}${c}`).join(', ')})`;
  }).join(', ');

  const valores = armadas.flatMap(l => [
    pedido.id, l.alegraItemId, l.nombre, l.referencia, l.cantidad,
    l.precio, l.taxPercentage, l.descuento, l.precioLista
  ]);

  await query(`
    INSERT INTO pedido_cliente_linea
      (pedido_id, alegra_item_id, nombre_producto, referencia, cantidad,
       precio_unitario, tax_percentage, descuento_porcentaje, precio_lista)
    VALUES ${filas};
  `, valores);

  return {
    pedido,
    yaExistia: false,
    // Se informan pero NO se pierde el pedido: es peor descartar una venta
    // entera por un producto que se dio de baja mientras el agente estaba en
    // la calle.
    noDisponibles
  };
}

module.exports = { crear };
