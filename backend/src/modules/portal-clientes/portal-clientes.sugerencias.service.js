/**
 * Portal de clientes - "Se lleva junto con", ficha de producto y compras
 * anteriores.
 *
 * Todo sale de `venta_linea` (las líneas de las facturas propias emitidas,
 * migración independencia/034), la misma fuente que alimenta las secciones de
 * la portada. Antes salía de `venta_historico`, que se sincronizaba de Alegra.
 *
 * Cliente, producto y factura se identifican siempre por sus ids propios.
 * La compra anterior se filtra por el cliente de la sesión.
 *
 * POR QUÉ SE CALCULA EN VIVO Y NO EN UNA TABLA PRECALCULADA
 * La co-ocurrencia de un producto tarda ~146ms, y la de un carrito de diez
 * productos tarda lo mismo (el índice por factura hace el trabajo).
 * Precalcular los 85.810 pares con 3+ coincidencias sería mantener una copia
 * que se desactualiza sola, para ahorrar un tiempo que nadie percibe.
 *
 * Las fichas de producto salen de `producto`, el maestro propio, con la misma
 * definición que el catálogo y el carrito (ver
 * catalogo-clientes/consultaProducto).
 */

const { query, httpError } = require('./portal-clientes.auth');
const { mapaVigentesPropios } = require('../../utils/descuentosExceso');
const { COLUMNAS, DESDE, VISIBLE, mapProducto } = require('../catalogo-clientes/consultaProducto');
const { HOY_CR } = require('../ventas/rotacion');
const { idValido: idDeProducto } = require('../../utils/validacion');

function idDeFactura(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw httpError(404, 'No encontramos esa compra.');
  return id;
}

// Mínimo de facturas compartidas para que un par cuente como "se lleva
// junto". Por debajo de esto es ruido: dos productos que coincidieron una
// vez no tienen relación, solo estuvieron en la misma factura.
const MIN_COINCIDENCIAS = 5;
const MAX_SUGERENCIAS = 6;

/**
 * Productos que suelen ir con los que se le pasan.
 *
 * `excluir` saca lo que el cliente ya tiene en el carrito: sugerirle algo
 * que acaba de agregar hace ver el sistema como si no lo estuviera mirando.
 */
async function seLlevaJuntoCon(productoIds, { excluir = [], limite = MAX_SUGERENCIAS } = {}) {
  const ids = (Array.isArray(productoIds) ? productoIds : [productoIds])
    .map(x => String(idDeProducto(x)));
  if (ids.length === 0) return [];

  const fuera = new Set([...ids, ...excluir.map(String)]);

  const co = await query(`
    SELECT o.producto_id, COUNT(DISTINCT o.factura_id)::int juntos
    FROM venta_linea v
    JOIN venta_linea o
      ON o.factura_id = v.factura_id
     AND o.producto_id <> v.producto_id
    WHERE v.producto_id = ANY($1::int[])
    GROUP BY o.producto_id
    HAVING COUNT(DISTINCT o.factura_id) >= $2
    ORDER BY juntos DESC
    LIMIT $3;
  `, [ids, MIN_COINCIDENCIAS, limite + fuera.size]);

  const candidatos = co.rows.filter(r => !fuera.has(String(r.producto_id))).slice(0, limite);
  if (candidatos.length === 0) return [];

  const [productos, descuentos] = await Promise.all([
    query(`SELECT ${COLUMNAS} ${DESDE} WHERE p.id = ANY($1::int[]) AND ${VISIBLE};`,
      [candidatos.map(c => String(c.producto_id))]),
    mapaVigentesPropios()
  ]);

  const veces = new Map(candidatos.map(c => [String(c.producto_id), c.juntos]));
  return productos.rows
    .map(row => mapProducto(row, descuentos, { juntos: veces.get(String(row.producto_id)) || 0 }))
    .sort((a, b) => b.juntos - a.juntos);
}

/**
 * Ficha de un producto, con la historia de ESE cliente con ESE producto.
 * Es lo que reemplaza a la publicidad: en vez de "otros lo recomiendan",
 * "usted lo ha llevado 26 veces".
 */
async function fichaProducto(clienteId, productoId) {
  const id = idDeProducto(productoId);

  const [prod, descuentos, hist] = await Promise.all([
    query(`SELECT ${COLUMNAS} ${DESDE} WHERE p.id = $1 AND ${VISIBLE};`, [id]),
    mapaVigentesPropios(),
    query(`
      SELECT COUNT(DISTINCT factura_id)::int veces,
             MIN(fecha) AS primera,
             MAX(fecha) AS ultima,
             SUM(cantidad)::numeric AS unidades,
             (${HOY_CR} - MAX(fecha)) AS dias
      FROM venta_linea
      WHERE cliente_id = $1
        AND producto_id = $2;
    `, [Number(clienteId), id])
  ]);

  if (prod.rows.length === 0) throw httpError(404, 'Ese producto ya no está disponible.');

  const h = hist.rows[0];
  const veces = Number(h?.veces) || 0;

  return {
    ...mapProducto(prod.rows[0], descuentos),
    historial: veces === 0 ? null : {
      veces,
      unidades: Number(h.unidades) || 0,
      primera: h.primera,
      ultima: h.ultima,
      dias: Number(h.dias)
    },
    juntoCon: await seLlevaJuntoCon(id, { limite: 4 })
  };
}

/**
 * Compras anteriores del cliente, una por factura, para "volver a pedir".
 * Sale de las facturas y no de los pedidos del portal: ahí está la historia
 * de verdad (5.261 facturas contra un puñado de pedidos nuevos).
 *
 * EL TOTAL ES EL DE LA FACTURA (`factura.total`), con su impuesto: el mismo
 * monto que el cliente ve en su cuenta por cobrar. Con el historial viejo
 * había que reconstruirlo (cantidad × precio sin IVA × la tarifa de HOY del
 * producto) y podía no calzar con el documento; ahora se lee del documento.
 *
 * `facturaId` es el id de la factura PROPIA. La pantalla lo recibe y lo
 * devuelve tal cual para abrir la compra.
 */
async function comprasAnteriores(clienteId, limite = 10) {
  const r = await query(`
    SELECT f.id AS factura_id, f.fecha, f.total,
           (SELECT COUNT(DISTINCT l.producto_id) FROM factura_linea l WHERE l.factura_id = f.id)::int AS productos
    FROM factura f
    WHERE f.cliente_id = $1
      AND f.estado = 'emitida'
    ORDER BY f.fecha DESC, f.id DESC
    LIMIT $2;
  `, [Number(clienteId), limite]);

  return r.rows.map(x => ({
    facturaId: x.factura_id,
    fecha: x.fecha,
    productos: x.productos,
    total: Math.round(Number(x.total) * 100) / 100
  }));
}

/**
 * Las líneas de una compra anterior, listas para volver al carrito.
 *
 * El filtro por cliente_id NO es decorativo: sin él, pasar el id de una
 * factura ajena devolvería lo que compró otro negocio. Y los ids de factura
 * propios son seriales (1, 2, 3…): adivinar uno es trivial.
 */
async function lineasDeCompra(clienteId, facturaId) {
  const r = await query(`
    SELECT v.producto_id, SUM(v.cantidad)::numeric AS cantidad
    FROM venta_linea v
    WHERE v.cliente_id = $1 AND v.factura_id = $2
    GROUP BY v.producto_id;
  `, [Number(clienteId), idDeFactura(facturaId)]);

  if (r.rows.length === 0) throw httpError(404, 'No encontramos esa compra.');

  return r.rows.map(x => ({
    productoId: String(x.producto_id),
    cantidad: Math.max(1, Math.round(Number(x.cantidad)))
  }));
}

/**
 * El detalle de una compra anterior, con la ficha de cada producto y su
 * PRECIO DE HOY.
 *
 * El precio que pagó aquella vez no se muestra: si lo viera y hoy costara
 * distinto, el total del pedido no le cuadraría con lo que tiene enfrente.
 * Lo que importa acá es qué llevó y cuánto, no a cuánto lo llevó.
 *
 * Los productos que ya no están se devuelven igual, marcados como no
 * disponibles: desaparecer en silencio de una lista que el cliente reconoce
 * es peor que decirle que ese ya no se consigue.
 */
async function detalleCompra(clienteId, facturaId) {
  const lineas = await query(`
    SELECT v.producto_id, SUM(v.cantidad)::numeric AS cantidad, MAX(v.fecha) AS fecha
    FROM venta_linea v
    WHERE v.cliente_id = $1 AND v.factura_id = $2
    GROUP BY v.producto_id;
  `, [Number(clienteId), idDeFactura(facturaId)]);

  if (lineas.rows.length === 0) throw httpError(404, 'No encontramos esa compra.');

  const ids = lineas.rows.map(l => String(l.producto_id));
  const [productos, descuentos] = await Promise.all([
    query(`SELECT ${COLUMNAS} ${DESDE} WHERE p.id = ANY($1::int[]) AND ${VISIBLE};`, [ids]),
    mapaVigentesPropios()
  ]);
  const porId = new Map(productos.rows.map(p => [String(p.producto_id), p]));

  const items = lineas.rows.map(l => {
    const id = String(l.producto_id);
    const row = porId.get(id);
    const cantidad = Math.max(1, Math.round(Number(l.cantidad)));
    if (!row) return { id, disponible: false, cantidad, nombre: null };
    return { ...mapProducto(row, descuentos), disponible: true, cantidad };
  });

  return {
    facturaId: String(facturaId),
    fecha: lineas.rows[0].fecha,
    items: items.sort((a, b) => Number(b.disponible) - Number(a.disponible)
      || String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'))
  };
}

module.exports = { seLlevaJuntoCon, fichaProducto, comprasAnteriores, lineasDeCompra, detalleCompra, MIN_COINCIDENCIAS };
