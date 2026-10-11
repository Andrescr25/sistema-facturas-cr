/**
 * El carrito guarda producto.id y cantidad; precio y ofertas se releen.
 * Las escrituras toman el mismo bloqueo que crearPedido: un envío no puede
 * vaciar un producto agregado mientras se estaba guardando el pedido.
 */
const { pool, query } = require('../../../config/database');
const { httpError, idValido } = require('../../utils/validacion');
const { enTransaccion } = require('../../utils/transaccion');
const { AHORA_CR_SQL } = require('../../utils/fechaCR');
const { mapaVigentesPropios } = require('../../utils/descuentosExceso');
const { COLUMNAS, DESDE, VISIBLE, mapProducto } = require('../catalogo-clientes/consultaProducto');

const MAX_LINEAS_CARRITO = 300;
const cantidadDe = (valor) => {
  const n = Number(valor);
  if (!Number.isFinite(n)) throw httpError(400, 'Cantidad inválida.');
  return Math.max(0, Math.floor(n));
};

async function bloquearCarrito(db, cuentaId) {
  await db.query(`INSERT INTO carrito_cliente (cliente_portal_id) VALUES ($1) ON CONFLICT DO NOTHING`, [cuentaId]);
  await db.query(`SELECT cliente_portal_id FROM carrito_cliente WHERE cliente_portal_id = $1 FOR UPDATE`, [cuentaId]);
}

async function obtenerCarrito(cuentaId, db = { query }, { bloquearProductos = false } = {}) {
  const { rows: lineas } = await db.query(`
    SELECT producto_id, alegra_item_id AS producto_historico, cantidad
      FROM carrito_cliente_linea WHERE cliente_portal_id = $1 ORDER BY agregado_en, id`, [cuentaId]);
  if (!lineas.length) return { lineas: [], total: 0, noDisponibles: [] };
  const ids = lineas.map(l => l.producto_id).filter(Boolean);
  const [productos, descuentos] = await Promise.all([
    db.query(`SELECT ${COLUMNAS} ${DESDE} WHERE p.id = ANY($1::int[]) AND ${VISIBLE}
      ${bloquearProductos ? 'FOR SHARE OF p' : ''}`, [ids]),
    mapaVigentesPropios(db)
  ]);
  const porId = new Map(productos.rows.map(p => [Number(p.producto_id), p]));
  const resultado = [], noDisponibles = [];
  for (const l of lineas) {
    const row = porId.get(l.producto_id);
    if (!row) { noDisponibles.push(l.producto_id ?? `historico:${l.producto_historico}`); continue; }
    resultado.push({ producto: mapProducto(row, descuentos), cantidad: Number(l.cantidad) });
  }
  return {
    lineas: resultado,
    total: Math.round(resultado.reduce((s, l) => s + l.cantidad * l.producto.precio, 0) * 100) / 100,
    noDisponibles
  };
}

async function ponerCantidad(cuentaId, productoId, cantidad) {
  const id = idValido(productoId), n = cantidadDe(cantidad);
  return enTransaccion(pool, async db => {
    await bloquearCarrito(db, cuentaId);
    if (n === 0) {
      await db.query(`DELETE FROM carrito_cliente_linea WHERE cliente_portal_id = $1 AND producto_id = $2`, [cuentaId, id]);
    } else {
      const existe = await db.query(`SELECT 1 ${DESDE} WHERE p.id = $1 AND ${VISIBLE}`, [id]);
      if (!existe.rows.length) throw httpError(400, 'Ese producto ya no está disponible.');
      const { rows: [{ n: cuantas }] } = await db.query(`
        SELECT COUNT(*)::int n FROM carrito_cliente_linea WHERE cliente_portal_id = $1 AND producto_id IS DISTINCT FROM $2`, [cuentaId, id]);
      if (cuantas >= MAX_LINEAS_CARRITO) throw httpError(400, `El carrito no puede tener más de ${MAX_LINEAS_CARRITO} productos.`);
      await db.query(`
        INSERT INTO carrito_cliente_linea (cliente_portal_id, producto_id, cantidad, agregado_en)
        VALUES ($1, $2, $3, ${AHORA_CR_SQL})
        ON CONFLICT (cliente_portal_id, producto_id) DO UPDATE SET cantidad = EXCLUDED.cantidad`, [cuentaId, id, n]);
    }
    await db.query(`UPDATE carrito_cliente SET actualizado_en = ${AHORA_CR_SQL} WHERE cliente_portal_id = $1`, [cuentaId]);
    return obtenerCarrito(cuentaId, db);
  });
}

async function vaciarCarrito(cuentaId) {
  return enTransaccion(pool, async db => {
    await bloquearCarrito(db, cuentaId);
    await db.query(`DELETE FROM carrito_cliente_linea WHERE cliente_portal_id = $1`, [cuentaId]);
    return { lineas: [], total: 0, noDisponibles: [] };
  });
}

/** Volver a pedir suma al carrito existente; nunca acepta ids de Alegra. */
async function agregarVarios(cuentaId, lineas) {
  if (!Array.isArray(lineas) || !lineas.length) return obtenerCarrito(cuentaId);
  const pedidas = new Map();
  for (const l of lineas) {
    const id = idValido(l.productoId), n = cantidadDe(l.cantidad);
    if (n) pedidas.set(id, (pedidas.get(id) || 0) + n);
  }
  return enTransaccion(pool, async db => {
    await bloquearCarrito(db, cuentaId);
    const { rows } = await db.query(`SELECT p.id ${DESDE} WHERE p.id = ANY($1::int[]) AND ${VISIBLE}`, [[...pedidas.keys()]]);
    const validos = new Set(rows.map(r => r.id));
    const actuales = await db.query(`SELECT producto_id FROM carrito_cliente_linea WHERE cliente_portal_id = $1`, [cuentaId]);
    const nuevos = [...validos].filter(id => !actuales.rows.some(l => l.producto_id === id));
    if (actuales.rows.length + nuevos.length > MAX_LINEAS_CARRITO) throw httpError(400, `El carrito no puede tener más de ${MAX_LINEAS_CARRITO} productos.`);
    for (const [id, n] of pedidas) {
      if (!validos.has(id)) continue;
      await db.query(`
        INSERT INTO carrito_cliente_linea (cliente_portal_id, producto_id, cantidad, agregado_en)
        VALUES ($1, $2, $3, ${AHORA_CR_SQL})
        ON CONFLICT (cliente_portal_id, producto_id)
        DO UPDATE SET cantidad = carrito_cliente_linea.cantidad + EXCLUDED.cantidad`, [cuentaId, id, n]);
    }
    await db.query(`UPDATE carrito_cliente SET actualizado_en = ${AHORA_CR_SQL} WHERE cliente_portal_id = $1`, [cuentaId]);
    return { ...await obtenerCarrito(cuentaId, db), agregados: validos.size, omitidos: pedidas.size - validos.size };
  });
}

module.exports = { obtenerCarrito, ponerCantidad, vaciarCarrito, agregarVarios, bloquearCarrito, mapProducto, COLUMNAS, DESDE, VISIBLE };
