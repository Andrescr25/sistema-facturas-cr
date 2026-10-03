/**
 * Portal de clientes - "Se lleva junto con", ficha de producto y compras
 * anteriores.
 *
 * Todo sale de `venta_linea` (las líneas de las facturas propias emitidas,
 * migración independencia/034), la misma fuente que alimenta las secciones de
 * la portada. Antes salía de `venta_historico`, que se sincronizaba de Alegra.
 *
 * LOS IDS, POR AHORA: adentro todo se cruza por `producto.id`, `cliente.id` y
 * `factura.id`. Hacia afuera el producto sigue saliendo con su id de Alegra
 * (el carrito y el pedido todavía se llavean por ahí) y el cliente llega por
 * el contacto de Alegra de su sesión: `SQL_CLIENTE` y `SQL_PRODUCTO` hacen
 * esa traducción en el borde, y se van cuando el portal pase a ids propios.
 * La compra anterior ya se identifica por el id de la factura propia.
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
const { mapaVigentes } = require('../../utils/descuentosExceso');
const { COLUMNAS, DESDE, VISIBLE, mapProducto } = require('../catalogo-clientes/consultaProducto');
const { HOY_CR } = require('../ventas/rotacion');

/** El cliente propio de un contacto de Alegra, y los productos propios de unos ids de Alegra. */
const SQL_CLIENTE = (n) => `(SELECT id FROM cliente WHERE alegra_id = $${n})`;
const SQL_PRODUCTOS = (n) => `(SELECT id FROM producto WHERE alegra_id = ANY($${n}::varchar[]))`;

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
async function seLlevaJuntoCon(alegraItemIds, { excluir = [], limite = MAX_SUGERENCIAS } = {}) {
  const ids = (Array.isArray(alegraItemIds) ? alegraItemIds : [alegraItemIds])
    .map(x => String(x).trim()).filter(Boolean);
  if (ids.length === 0) return [];

  const fuera = new Set([...ids, ...excluir.map(String)]);

  const co = await query(`
    SELECT po.alegra_id AS alegra_item_id, COUNT(DISTINCT o.factura_id)::int juntos
    FROM venta_linea v
    JOIN venta_linea o
      ON o.factura_id = v.factura_id
     AND o.producto_id <> v.producto_id
    JOIN producto po ON po.id = o.producto_id AND po.alegra_id IS NOT NULL
    WHERE v.producto_id IN ${SQL_PRODUCTOS(1)}
    GROUP BY po.alegra_id
    HAVING COUNT(DISTINCT o.factura_id) >= $2
    ORDER BY juntos DESC
    LIMIT $3;
  `, [ids, MIN_COINCIDENCIAS, limite + fuera.size]);

  const candidatos = co.rows.filter(r => !fuera.has(String(r.alegra_item_id))).slice(0, limite);
  if (candidatos.length === 0) return [];

  const [productos, descuentos] = await Promise.all([
    query(`SELECT ${COLUMNAS} ${DESDE} WHERE p.alegra_id = ANY($1::varchar[]) AND ${VISIBLE};`,
      [candidatos.map(c => String(c.alegra_item_id))]),
    mapaVigentes()
  ]);

  const veces = new Map(candidatos.map(c => [String(c.alegra_item_id), c.juntos]));
  return productos.rows
    .map(row => mapProducto(row, descuentos, { juntos: veces.get(String(row.alegra_id)) || 0 }))
    .sort((a, b) => b.juntos - a.juntos);
}

/**
 * Ficha de un producto, con la historia de ESE cliente con ESE producto.
 * Es lo que reemplaza a la publicidad: en vez de "otros lo recomiendan",
 * "usted lo ha llevado 26 veces".
 */
async function fichaProducto(alegraContactId, alegraItemId) {
  const id = String(alegraItemId).trim();

  const [prod, descuentos, hist] = await Promise.all([
    query(`SELECT ${COLUMNAS} ${DESDE} WHERE p.alegra_id = $1 AND ${VISIBLE};`, [id]),
    mapaVigentes(),
    query(`
      SELECT COUNT(DISTINCT factura_id)::int veces,
             MIN(fecha) AS primera,
             MAX(fecha) AS ultima,
             SUM(cantidad)::numeric AS unidades,
             (${HOY_CR} - MAX(fecha)) AS dias
      FROM venta_linea
      WHERE cliente_id = ${SQL_CLIENTE(1)}
        AND producto_id = (SELECT id FROM producto WHERE alegra_id = $2);
    `, [String(alegraContactId), id])
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
async function comprasAnteriores(alegraContactId, limite = 10) {
  const r = await query(`
    SELECT f.id AS factura_id, f.fecha, f.total,
           (SELECT COUNT(DISTINCT l.producto_id) FROM factura_linea l WHERE l.factura_id = f.id)::int AS productos
    FROM factura f
    WHERE f.cliente_id = ${SQL_CLIENTE(1)}
      AND f.estado = 'emitida'
    ORDER BY f.fecha DESC, f.id DESC
    LIMIT $2;
  `, [String(alegraContactId), limite]);

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
async function lineasDeCompra(alegraContactId, facturaId) {
  const r = await query(`
    SELECT p.alegra_id AS alegra_item_id, SUM(v.cantidad)::numeric AS cantidad
    FROM venta_linea v
    JOIN producto p ON p.id = v.producto_id AND p.alegra_id IS NOT NULL
    WHERE v.cliente_id = ${SQL_CLIENTE(1)} AND v.factura_id = $2
    GROUP BY p.alegra_id;
  `, [String(alegraContactId), idDeFactura(facturaId)]);

  if (r.rows.length === 0) throw httpError(404, 'No encontramos esa compra.');

  return r.rows.map(x => ({
    alegraItemId: String(x.alegra_item_id),
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
async function detalleCompra(alegraContactId, facturaId) {
  const lineas = await query(`
    SELECT p.alegra_id AS alegra_item_id, SUM(v.cantidad)::numeric AS cantidad, MAX(v.fecha) AS fecha
    FROM venta_linea v
    JOIN producto p ON p.id = v.producto_id AND p.alegra_id IS NOT NULL
    WHERE v.cliente_id = ${SQL_CLIENTE(1)} AND v.factura_id = $2
    GROUP BY p.alegra_id;
  `, [String(alegraContactId), idDeFactura(facturaId)]);

  if (lineas.rows.length === 0) throw httpError(404, 'No encontramos esa compra.');

  const ids = lineas.rows.map(l => String(l.alegra_item_id));
  const [productos, descuentos] = await Promise.all([
    query(`SELECT ${COLUMNAS} ${DESDE} WHERE p.alegra_id = ANY($1::varchar[]) AND ${VISIBLE};`, [ids]),
    mapaVigentes()
  ]);
  const porId = new Map(productos.rows.map(p => [String(p.alegra_id), p]));

  const items = lineas.rows.map(l => {
    const id = String(l.alegra_item_id);
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
