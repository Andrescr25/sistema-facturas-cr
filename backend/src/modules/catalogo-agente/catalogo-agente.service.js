/**
 * Catálogo del agente - Service
 *
 * Los productos y las categorías salen de `producto`, el maestro propio. Era
 * un proxy de solo lectura a Alegra: la tablet paginaba de a 30 CONTRA ALEGRA,
 * así que sincronizar el catálogo en el campo dependía de que Alegra
 * contestara, y era la última pantalla que lo hacía.
 *
 * Qué es un producto visible NO se redefine acá: sale de
 * `catalogo-clientes/consultaProducto`, el mismo lugar que usan el catálogo de
 * clientes y el portal. Si cada pantalla lo decidiera por su lado, el agente
 * podría ofrecer algo que el cliente no ve, o a otro precio.
 *
 * SE DEVUELVEN LOS NOMBRES DE ALEGRA (`name`, `price`, `tax`, `images`) porque
 * la tablet todavía los lee así y guarda el catálogo sin conexión. Es la misma
 * deuda anotada en §16: se traduce el día que esos componentes hablen nuestro
 * idioma, no antes, para no obligar a resincronizar todas las tablets.
 */

const { COLUMNAS, DESDE, VISIBLE } = require('../catalogo-clientes/consultaProducto');
// Alegra ya no sirve el catálogo, pero el histórico de compras todavía se
// sincroniza desde allá (sección 12 del checklist).
const { ofertasPorBajaDePrecio } = require('../precios/ofertasPorBaja');
const { query } = require('../../../config/database');
const { listarVigentes } = require('../../utils/descuentosExceso');
const { hoyEnCostaRica } = require('../../utils/fechaCR');
const categoriasConfig = require('../catalogo/categorias.service');
const subcategoriasConfig = require('../catalogo/subcategorias.service');
const rotacion = require('../ventas/rotacion');

// La tablet pide de a 30 y guarda el catálogo sin conexión; se conserva el
// tamaño de página para no tener que cambiarla a ella también.
const PAGINA = 30;

/**
 * Una fila de `producto` con la forma que la tablet espera.
 *
 * NO SE MANDA `inventory`, y eso es a propósito: el maestro propio todavía no
 * lleva existencias (sección 5 del checklist). Mandar un inventario vacío haría
 * que la tarjeta calculara cero disponibles y mostrara TODO como "Agotado" —
 * peor que no decir nada—. Sin el campo, la tarjeta no afirma nada.
 */
function aFormaDeTablet(row) {
  const tarifa = Number(row.tarifa);

  return {
    id: String(row.alegra_id),
    productoId: row.producto_id,
    name: row.nombre,
    reference: row.referencia || '',
    status: 'active',
    price: [{ price: Number(row.precio_sin_iva) || 0 }],
    tax: Number.isFinite(tarifa) && tarifa > 0 ? [{ percentage: tarifa }] : [],
    images: row.imagen_url ? [{ url: row.imagen_url, favorite: true }] : [],
    // `itemCategory`, como lo llama Alegra en /items: es lo que lee la tablet
    // para partir el catálogo (catalogoAgentePersonalizacion.js). Con
    // `category` —el nombre que usa la caché, no Alegra— los 2.012 productos
    // caían en "Otros" y la barra de categorías quedaba vacía.
    itemCategory: row.categoria ? { name: row.categoria } : null
  };
}

/**
 * Pegarle a cada producto su subcategoría.
 *
 * Sale de `producto.subcategoria_id` (migración 030), que es donde la pone
 * Gestión de Catálogo en esta rama. En `main` vive en `alegra_products_cache`;
 * leerla de allá acá haría que lo que se clasifica en la pantalla no llegara
 * nunca a la tablet.
 *
 * Se agrega de a página, para que viaje con el catálogo que la tablet guarda
 * para trabajar sin señal: pedirla aparte obligaría a una segunda descarga
 * que en el campo no siempre se puede hacer.
 *
 * Si la consulta falla, el catálogo sale sin subcategorías en vez de no
 * salir: es un dato para ordenar la vista, no para vender.
 */
async function conSubcategoria(productos) {
  if (productos.length === 0) return productos;

  try {
    const ids = productos.map((p) => p.productoId).filter(Boolean);
    const { rows } = await query(
      `SELECT p.id AS producto_id, s.id AS sub_id, s.nombre AS sub_nombre
         FROM producto p
         JOIN subcategoria s ON s.id = p.subcategoria_id AND s.activo = true
        WHERE p.id = ANY($1::int[])`,
      [ids]
    );

    const porId = new Map(rows.map((r) => [r.producto_id, { id: r.sub_id, nombre: r.sub_nombre }]));
    return productos.map((p) => {
      const sub = porId.get(p.productoId);
      return sub ? { ...p, subcategoria: sub } : p;
    });
  } catch (error) {
    console.error('⚠️ No se pudieron adjuntar subcategorías al catálogo:', error.message);
    return productos;
  }
}

/**
 * GET /api/catalogo-agente/productos?start=&limit=
 * Devuelve { products, debug } igual que el proxy original, filtrando solo
 * productos activos.
 */
async function listarProductos({ start = 0, limit = 30 } = {}) {
  const startNum = Math.max(parseInt(start, 10) || 0, 0);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || PAGINA, 1), PAGINA);

  const { rows } = await query(`
    SELECT ${COLUMNAS}
    ${DESDE}
    WHERE ${VISIBLE}
    ORDER BY p.nombre
    LIMIT $1 OFFSET $2
  `, [limitNum, startNum]);

  return {
    products: await conSubcategoria(rows.map(aFormaDeTablet)),
    debug: {
      start: startNum,
      limit: limitNum,
      total_received: rows.length,
      active_filtered: rows.length,
      has_more: rows.length === limitNum
    }
  };
}

/**
 * GET /api/catalogo-agente/categorias
 */
async function listarCategorias() {
  const { rows } = await query(
    `SELECT id, nombre FROM categoria_producto WHERE activo = TRUE ORDER BY nombre`
  );
  return rows.map(c => ({ id: String(c.id), name: c.nombre }));
}

/**
 * GET /api/catalogo-agente/ofertas
 * Productos de exceso que el empacador ya confirmó como listos en caja
 * (empacado = TRUE en su ítem de exceso más reciente), que esa cantidad
 * física efectiva (corregida o, si no se corrigió, la del sistema) sea
 * mayor a 0 — si el empacador contó 0 unidades reales, no hay nada que
 * mostrar en el catálogo — y que todavía no llegaron al 100% de descuento
 * (no regalados). Estos se muestran destacados arriba del catálogo público.
 */
async function listarOfertas() {
  // La definición de "descuento vigente" vive en src/utils/descuentosExceso.js
  // porque la comparten los dos catálogos y el armado del pedido. Si cada uno
  // la escribiera por su lado, el cliente podría ver una oferta que al pedirla
  // se le cobra completa.
  return listarVigentes();
}

/**
 * GET /api/catalogo-agente/ofertas-baja
 * Los productos a los que se les bajó el precio resignando margen. Es otra
 * cosa que `listarOfertas`, que son los excesos de inventario: acá no sobra
 * nada, se decidió vender más barato para mover el producto.
 */
async function listarOfertasPorBaja() {
  return ofertasPorBajaDePrecio();
}

// ==================== HISTORIAL DE COMPRAS POR CLIENTE ====================
// Alimenta la personalización del catálogo: qué le conviene mostrar primero al
// agente según el cliente que está visitando.
//
// SALE DE `venta_linea` (las líneas de las facturas propias EMITIDAS,
// migración independencia/034). Antes salía de `venta_historico`, una copia
// que se llenaba al facturar en Alegra y se repasaba cada hora contra Alegra
// (sincronizarHistorialCompras, registrarFacturaEnHistorico): todo eso se
// retiró el 2026-10-03. La regla "un borrador o una anulada no es una venta"
// ahora la cumple la vista.

/**
 * Payload compacto para descarga offline: por cada cliente, sus top 120
 * productos por número de facturas distintas en que aparecen ("veces"),
 * junto a la fecha de la última compra de cada uno. El decaimiento por
 * recencia se calcula en el dispositivo contra la fecha de hoy — no acá —
 * para que el score siga siendo correcto días después de sincronizar.
 *
 * LOS IDS QUE SALEN SON LOS DE ALEGRA, todavía: la tablet guarda clientes y
 * productos con ese id hasta que su caché pase a ids propios (sección 12 del
 * checklist). Adentro todo se cruza por `cliente.id` y `producto.id`; un
 * cliente o un producto creado acá, sin id de Alegra, no entra hasta entonces.
 *
 * El nombre del cliente es el de su ficha de hoy, no el que decía cada factura.
 */
async function obtenerHistorialParaCatalogo() {
  const result = await query(`
    WITH agregado AS (
      SELECT c.alegra_id AS cliente_id, MAX(c.nombre) AS cliente_nombre, p.alegra_id AS alegra_item_id,
             COUNT(DISTINCT v.factura_id) AS veces,
             MAX(v.fecha) AS ultima_compra
      FROM venta_linea v
      JOIN cliente c ON c.id = v.cliente_id AND c.alegra_id IS NOT NULL
      JOIN producto p ON p.id = v.producto_id AND p.alegra_id IS NOT NULL
      GROUP BY c.alegra_id, p.alegra_id
    ),
    rankeado AS (
      SELECT a.*, ROW_NUMBER() OVER (PARTITION BY a.cliente_id ORDER BY a.veces DESC, a.ultima_compra DESC) AS rn
      FROM agregado a
    )
    SELECT r.cliente_id, r.cliente_nombre, r.alegra_item_id, r.veces, r.ultima_compra::text AS ultima_compra
    FROM rankeado r
    WHERE r.rn <= 120
    ORDER BY r.cliente_id, r.veces DESC;
  `);

  const clientesMap = new Map();
  for (const row of result.rows) {
    if (!clientesMap.has(row.cliente_id)) {
      clientesMap.set(row.cliente_id, { id: row.cliente_id, n: row.cliente_nombre || '', p: [] });
    }
    clientesMap.get(row.cliente_id).p.push([row.alegra_item_id, Number(row.veces), row.ultima_compra]);
  }

  return {
    generadoEn: hoyEnCostaRica(),
    clientes: [...clientesMap.values()]
  };
}

/**
 * GET /api/catalogo-agente/config-catalogo
 *
 * El orden y el nombre visible de categorías, y el orden de subcategorías
 * dentro de cada una — lo que la tablet necesita para pintar el catálogo en
 * el mismo orden que se armó en Gestión de Catálogo. Se descarga una vez por
 * sincronización, junto con los productos: es una tabla chica (categorías +
 * subcategorías, no productos), así que no vale la pena paginarla.
 */
async function obtenerConfigCatalogo() {
  const [categorias, subcategorias] = await Promise.all([
    categoriasConfig.listar(),
    subcategoriasConfig.listar({ incluirInactivas: false })
  ]);
  return { categorias, subcategorias };
}

/**
 * GET /api/catalogo-agente/rotacion
 *
 * Qué productos son de rotación A y cuáles B, para el catálogo de "Cliente
 * nuevo": a quien todavía no compra se le enseña lo que más se vende, que es
 * lo más fácil de vender.
 *
 * Es la rotación EN TIEMPO REAL de ventas/rotacion.js (unidades de los
 * últimos 3 meses, Pareto 80/95). Solo los ids: las unidades que dan la clase
 * no le sirven a la tablet. La C no se manda: no se muestra.
 */
async function obtenerRotacion() {
  const clases = await rotacion.clasesAB();
  return { ...clases, calculadoEn: new Date().toISOString() };
}

module.exports = {
  obtenerRotacion,
  conSubcategoria,
  listarProductos,
  listarCategorias,
  listarOfertas,
  listarOfertasPorBaja,
  obtenerHistorialParaCatalogo,
  obtenerConfigCatalogo
};
