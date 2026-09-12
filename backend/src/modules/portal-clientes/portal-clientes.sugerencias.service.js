/**
 * Portal de clientes - "Se lleva junto con", ficha de producto y compras
 * anteriores.
 *
 * Todo sale de venta_historico, la misma tabla que ya alimenta las secciones
 * de la portada. No se recolecta ningún dato nuevo.
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
    SELECT o.alegra_item_id, COUNT(DISTINCT o.alegra_invoice_id)::int juntos
    FROM venta_historico v
    JOIN venta_historico o
      ON o.alegra_invoice_id = v.alegra_invoice_id
     AND o.alegra_item_id <> v.alegra_item_id
    WHERE v.alegra_item_id = ANY($1::varchar[])
    GROUP BY o.alegra_item_id
    HAVING COUNT(DISTINCT o.alegra_invoice_id) >= $2
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
      SELECT COUNT(DISTINCT alegra_invoice_id)::int veces,
             MIN(fecha_emision) AS primera,
             MAX(fecha_emision) AS ultima,
             SUM(cantidad)::numeric AS unidades,
             (CURRENT_DATE - MAX(fecha_emision)::date) AS dias
      FROM venta_historico
      WHERE cliente_id = $1 AND alegra_item_id = $2;
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
 * Compras anteriores del cliente, agrupadas por factura, para "volver a
 * pedir". Sale de venta_historico y no de los pedidos del portal: ahí está
 * la historia de verdad (5.261 facturas contra un puñado de pedidos nuevos).
 *
 * `precio_unitario` en venta_historico es el `price` que devuelve Alegra en
 * las líneas de factura, SIN impuesto (misma asimetría que el precio de
 * lista de un producto). Sin el JOIN de abajo el total de la tarjeta era el
 * subtotal antes de IVA — no "el monto verdadero de la factura" que el
 * cliente ve en su cuenta por cobrar, sino un ~13% menos. La tarifa sale del
 * maestro propio, la misma fuente que usa detalleCompra, así que la tarjeta y
 * el modal de "Ver y repetir" cuentan la misma historia.
 */
async function comprasAnteriores(alegraContactId, limite = 10) {
  const r = await query(`
    SELECT v.alegra_invoice_id, MAX(v.fecha_emision) AS fecha,
           COUNT(DISTINCT v.alegra_item_id)::int productos,
           SUM(v.cantidad * v.precio_unitario * (1 + COALESCE(imp.tarifa, 0) / 100))::numeric AS total
    FROM venta_historico v
    LEFT JOIN producto p ON p.alegra_id = v.alegra_item_id
    LEFT JOIN impuesto imp ON imp.id = p.impuesto_id
    WHERE v.cliente_id = $1
    GROUP BY v.alegra_invoice_id
    ORDER BY fecha DESC
    LIMIT $2;
  `, [String(alegraContactId), limite]);

  return r.rows.map(x => ({
    facturaId: x.alegra_invoice_id,
    fecha: x.fecha,
    productos: x.productos,
    total: Math.round(Number(x.total) * 100) / 100
  }));
}

/**
 * Las líneas de una compra anterior, listas para volver al carrito.
 *
 * El filtro por cliente_id NO es decorativo: sin él, pasar el id de una
 * factura ajena devolvería lo que compró otro negocio.
 */
async function lineasDeCompra(alegraContactId, facturaId) {
  const r = await query(`
    SELECT alegra_item_id, SUM(cantidad)::numeric AS cantidad
    FROM venta_historico
    WHERE cliente_id = $1 AND alegra_invoice_id = $2
    GROUP BY alegra_item_id;
  `, [String(alegraContactId), String(facturaId)]);

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
    SELECT alegra_item_id, SUM(cantidad)::numeric AS cantidad, MAX(fecha_emision) AS fecha
    FROM venta_historico
    WHERE cliente_id = $1 AND alegra_invoice_id = $2
    GROUP BY alegra_item_id;
  `, [String(alegraContactId), String(facturaId)]);

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
