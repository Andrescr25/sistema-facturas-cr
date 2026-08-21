/**
 * Portal de clientes - Carrito y sugerencias
 *
 * El carrito vive en el servidor y guarda SOLO producto y cantidad. Los
 * precios se resuelven en cada lectura contra el catálogo y las ofertas del
 * momento: un carrito que quedó armado tres días no debe mostrar precios
 * viejos ni una oferta que ya terminó.
 */

const { query, httpError } = require('./portal-clientes.auth');
const { precioConImpuesto } = require('../catalogo-clientes/precio');
const { mapaVigentes, aplicarDescuento } = require('../../utils/descuentosExceso');

const MAX_LINEAS_CARRITO = 300;
const COLUMNAS = `alegra_id, name, reference, category, price, tax_percentage, image_url`;
const VISIBLE = `status = 'active' AND hidden_locally = FALSE AND price > 0`;

function mapProducto(row, descuentos, extra = {}) {
  const precioLista = precioConImpuesto(row.price, row.tax_percentage);
  const descuento = descuentos.get(String(row.alegra_id)) || 0;
  return {
    id: row.alegra_id,
    nombre: row.name,
    referencia: row.reference || null,
    categoria: row.category || 'Sin categoría',
    precio: aplicarDescuento(precioLista, descuento),
    precioLista: descuento > 0 ? precioLista : null,
    descuento: descuento > 0 ? descuento : null,
    imagen: row.image_url || null,
    ...extra
  };
}

// ==================== CARRITO ====================

/**
 * Devuelve el carrito con los precios de HOY.
 *
 * Las líneas cuyo producto dejó de estar disponible se informan aparte en
 * vez de desaparecer en silencio: el cliente tiene que enterarse de que algo
 * que había agregado ya no está, no descubrirlo cuando el total no cuadra.
 */
async function obtenerCarrito(clienteId) {
  const lineas = await query(
    `SELECT alegra_item_id, cantidad FROM carrito_cliente_linea
     WHERE cliente_portal_id = $1 ORDER BY agregado_en;`,
    [clienteId]
  );
  if (lineas.rows.length === 0) return { lineas: [], total: 0, noDisponibles: [] };

  const ids = lineas.rows.map(l => String(l.alegra_item_id));
  const [productos, descuentos] = await Promise.all([
    query(`SELECT ${COLUMNAS} FROM alegra_products_cache WHERE alegra_id = ANY($1::varchar[]) AND ${VISIBLE};`, [ids]),
    mapaVigentes()
  ]);

  const porId = new Map(productos.rows.map(p => [String(p.alegra_id), p]));
  const resultado = [];
  const noDisponibles = [];

  for (const l of lineas.rows) {
    const row = porId.get(String(l.alegra_item_id));
    if (!row) { noDisponibles.push(String(l.alegra_item_id)); continue; }
    resultado.push({ producto: mapProducto(row, descuentos), cantidad: Number(l.cantidad) });
  }

  return {
    lineas: resultado,
    total: resultado.reduce((s, l) => s + l.cantidad * l.producto.precio, 0),
    noDisponibles
  };
}

/**
 * Cambia la cantidad de UN producto. Cantidad 0 lo saca.
 *
 * Es una operación por producto y no "guardar el carrito entero" a propósito:
 * si el cliente tiene el carrito abierto en el teléfono y en la computadora,
 * mandar el carrito completo desde uno pisaría lo que agregó en el otro.
 */
async function ponerCantidad(clienteId, alegraItemId, cantidad) {
  const id = String(alegraItemId || '').trim();
  const n = Math.max(0, Math.floor(Number(cantidad) || 0));
  if (!id) throw httpError(400, 'Producto inválido.');

  if (n === 0) {
    await query(`DELETE FROM carrito_cliente_linea WHERE cliente_portal_id = $1 AND alegra_item_id = $2;`, [clienteId, id]);
    return obtenerCarrito(clienteId);
  }

  const existe = await query(
    `SELECT 1 FROM alegra_products_cache WHERE alegra_id = $1 AND ${VISIBLE};`, [id]
  );
  if (existe.rows.length === 0) throw httpError(400, 'Ese producto ya no está disponible.');

  const cuantas = await query(
    `SELECT COUNT(*)::int n FROM carrito_cliente_linea WHERE cliente_portal_id = $1 AND alegra_item_id <> $2;`,
    [clienteId, id]
  );
  if (cuantas.rows[0].n >= MAX_LINEAS_CARRITO) {
    throw httpError(400, `El carrito no puede tener más de ${MAX_LINEAS_CARRITO} productos.`);
  }

  await query(`INSERT INTO carrito_cliente (cliente_portal_id) VALUES ($1) ON CONFLICT DO NOTHING;`, [clienteId]);
  await query(`
    INSERT INTO carrito_cliente_linea (cliente_portal_id, alegra_item_id, cantidad)
    VALUES ($1, $2, $3::numeric)
    ON CONFLICT (cliente_portal_id, alegra_item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
  `, [clienteId, id, n]);
  await query(`UPDATE carrito_cliente SET actualizado_en = CURRENT_TIMESTAMP WHERE cliente_portal_id = $1;`, [clienteId]);

  return obtenerCarrito(clienteId);
}

async function vaciarCarrito(clienteId) {
  await query(`DELETE FROM carrito_cliente_linea WHERE cliente_portal_id = $1;`, [clienteId]);
  return { lineas: [], total: 0, noDisponibles: [] };
}

/**
 * Agrega varios productos de una sola vez, SUMANDO a lo que ya haya.
 *
 * Lo usa "volver a pedir": si el cliente ya tenía algo en el carrito, repetir
 * una compra anterior no debe borrárselo.
 */
async function agregarVarios(clienteId, lineas) {
  if (!Array.isArray(lineas) || lineas.length === 0) return obtenerCarrito(clienteId);

  await query(`INSERT INTO carrito_cliente (cliente_portal_id) VALUES ($1) ON CONFLICT DO NOTHING;`, [clienteId]);

  const ids = lineas.map(l => String(l.alegraItemId || '').trim()).filter(Boolean);
  const disponibles = await query(
    `SELECT alegra_id FROM alegra_products_cache WHERE alegra_id = ANY($1::varchar[]) AND ${VISIBLE};`, [ids]
  );
  const validos = new Set(disponibles.rows.map(r => String(r.alegra_id)));

  let agregados = 0;
  let omitidos = 0;
  for (const l of lineas) {
    const id = String(l.alegraItemId || '').trim();
    const n = Math.max(0, Math.floor(Number(l.cantidad) || 0));
    if (!id || n === 0) continue;
    if (!validos.has(id)) { omitidos++; continue; }

    await query(`
      INSERT INTO carrito_cliente_linea (cliente_portal_id, alegra_item_id, cantidad)
      VALUES ($1, $2, $3::numeric)
      ON CONFLICT (cliente_portal_id, alegra_item_id)
      DO UPDATE SET cantidad = carrito_cliente_linea.cantidad + EXCLUDED.cantidad;
    `, [clienteId, id, n]);
    agregados++;
  }

  await query(`UPDATE carrito_cliente SET actualizado_en = CURRENT_TIMESTAMP WHERE cliente_portal_id = $1;`, [clienteId]);

  const carrito = await obtenerCarrito(clienteId);
  return { ...carrito, agregados, omitidos };
}

module.exports = { obtenerCarrito, ponerCantidad, vaciarCarrito, agregarVarios, mapProducto, COLUMNAS, VISIBLE };
