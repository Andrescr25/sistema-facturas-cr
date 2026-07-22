/**
 * Catalogo Publico Module - Service
 * Proxy de solo lectura hacia Alegra para el catálogo público (tablets/agentes
 * de venta, sin internet en campo). Réplica del server.js de catalogo-alegra-proxy-2,
 * reutilizando el cliente Alegra ya centralizado (getClient()) en vez de un
 * segundo cliente HTTP con credenciales separadas.
 */

const { getClient } = require('../../integrations/alegra');
const { query } = require('../../../config/database');

const ALEGRA_LIMIT_MAXIMO = 30;

/**
 * GET /api/catalogo-publico/productos?start=&limit=
 * Devuelve { products, debug } igual que el proxy original, filtrando solo
 * productos activos.
 */
async function listarProductos({ start = 0, limit = 30 } = {}) {
  const startNum = parseInt(start, 10) || 0;
  const limitNum = Math.min(parseInt(limit, 10) || ALEGRA_LIMIT_MAXIMO, ALEGRA_LIMIT_MAXIMO);

  const client = getClient();
  const result = await client.get('/items', { start: startNum, limit: limitNum });

  if (!result.success) {
    const error = new Error(`Error de Alegra: ${result.status || ''} ${result.error || ''}`.trim());
    error.status = 502;
    throw error;
  }

  const data = result.data;
  if (!Array.isArray(data)) {
    const error = new Error('Formato de respuesta inválido de Alegra');
    error.status = 502;
    throw error;
  }

  const activeProducts = data.filter((product) => product && product.status === 'active');

  return {
    products: activeProducts,
    debug: {
      start: startNum,
      limit: limitNum,
      total_received: data.length,
      active_filtered: activeProducts.length,
      has_more: data.length === ALEGRA_LIMIT_MAXIMO
    }
  };
}

/**
 * GET /api/catalogo-publico/categorias
 */
async function listarCategorias() {
  const client = getClient();
  const result = await client.get('/item-categories');

  if (!result.success) {
    const error = new Error(`Error de Alegra: ${result.status || ''} ${result.error || ''}`.trim());
    error.status = 502;
    throw error;
  }

  return result.data;
}

/**
 * GET /api/catalogo-publico/ofertas
 * Productos de exceso que el empacador ya confirmó como listos en caja
 * (empacado = TRUE en su ítem de exceso más reciente), que esa cantidad
 * física efectiva (corregida o, si no se corrigió, la del sistema) sea
 * mayor a 0 — si el empacador contó 0 unidades reales, no hay nada que
 * mostrar en el catálogo — y que todavía no llegaron al 100% de descuento
 * (no regalados). Estos se muestran destacados arriba del catálogo público.
 */
async function listarOfertas() {
  const result = await query(`
    WITH ultimo_empaque AS (
      SELECT DISTINCT ON (iai.alegra_id)
        iai.alegra_id,
        COALESCE(iai.stock_real, iai.stock_sistema) AS stock_efectivo
      FROM inventario_auditoria_items iai
      JOIN inventario_auditorias ia ON ia.id = iai.auditoria_id AND ia.tipo = 'exceso'
      WHERE iai.empacado = TRUE
      ORDER BY iai.alegra_id, iai.created_at DESC
    )
    SELECT pde.alegra_item_id, pde.nombre_producto, pde.descuento_porcentaje
    FROM producto_descuento_exceso pde
    JOIN ultimo_empaque ue ON ue.alegra_id = pde.alegra_item_id
    WHERE pde.regalado = FALSE AND ue.stock_efectivo > 0
    ORDER BY pde.descuento_porcentaje DESC;
  `);

  return result.rows.map((row) => ({
    id: row.alegra_item_id,
    nombre: row.nombre_producto,
    descuentoPorcentaje: row.descuento_porcentaje
  }));
}

module.exports = {
  listarProductos,
  listarCategorias,
  listarOfertas
};
