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

// ==================== HISTORIAL DE COMPRAS POR CLIENTE ====================
// Alimenta la personalización del catálogo público: qué le conviene mostrar
// primero al agente según el cliente que está visitando. Ledger crudo en
// venta_historico (histórico completo, sin poda) — a propósito separado de
// venta_items, que tiene ventana móvil de 120 días para detección de excesos
// y no conviene arriesgar.

const LIMIT_INVOICES_HISTORIAL = 30; // máximo que acepta /invoices en Alegra
const COLUMNAS_VENTA_HISTORICO = 7; // alegra_invoice_id, alegra_item_id, cliente_id, cliente_nombre, cantidad, precio_unitario, fecha_emision
const FILAS_POR_INSERT = 150; // lotes moderados — un lote de 500 disparó un corte SSL contra el pooler de Supabase en vivo

/**
 * INSERT multi-fila (chunked) con upsert, para no hacer un round-trip a
 * Supabase por cada línea de venta. `filas` es un array de arrays en el
 * mismo orden que COLUMNAS_VENTA_HISTORICO. Reintenta cada lote un par de
 * veces — el pooler de Supabase (PgBouncer) a veces corta la conexión con
 * un error SSL transitorio en queries grandes; es un INSERT idempotente
 * (ON CONFLICT), así que repetirlo es seguro.
 */
async function insertarLotesVentaHistorico(filas) {
  for (let i = 0; i < filas.length; i += FILAS_POR_INSERT) {
    const lote = filas.slice(i, i + FILAS_POR_INSERT);
    const placeholders = lote
      .map((_, idx) => {
        const base = idx * COLUMNAS_VENTA_HISTORICO;
        const cols = Array.from({ length: COLUMNAS_VENTA_HISTORICO }, (_, c) => `$${base + c + 1}`);
        return `(${cols.join(', ')})`;
      })
      .join(', ');
    const valores = lote.flat();

    const sql = `
      INSERT INTO venta_historico (alegra_invoice_id, alegra_item_id, cliente_id, cliente_nombre, cantidad, precio_unitario, fecha_emision)
      VALUES ${placeholders}
      ON CONFLICT (alegra_invoice_id, alegra_item_id) DO UPDATE SET
        cliente_id = EXCLUDED.cliente_id,
        cliente_nombre = EXCLUDED.cliente_nombre,
        cantidad = EXCLUDED.cantidad,
        precio_unitario = EXCLUDED.precio_unitario,
        fecha_emision = EXCLUDED.fecha_emision;
    `;

    let ultimoError;
    for (let intento = 1; intento <= 3; intento++) {
      try {
        await query(sql, valores);
        ultimoError = null;
        break;
      } catch (error) {
        ultimoError = error;
        console.log(`   ⚠️ [Catálogo] Error insertando lote (intento ${intento}/3): ${error.message}`);
        await new Promise((r) => setTimeout(r, 800 * intento));
      }
    }
    if (ultimoError) throw ultimoError;
  }
}

/**
 * Trae de Alegra las facturas de venta emitidas entre `startDate` y hoy y
 * hace upsert de sus líneas en venta_historico. Por defecto es incremental:
 * arranca 2 días antes de la última fecha ya sincronizada (margen por si
 * quedaron facturas del mismo día sin traer por límite de paginación). Sin
 * histórico previo y sin `desde` explícito, trae todo (backfill completo).
 *
 * Si un producto aparece en más de una línea de la misma factura, se suman
 * ANTES de insertar (no en el ON CONFLICT) — sumar ahí duplicaría el total
 * cada vez que se reprocesa la misma factura en un sync incremental.
 */
async function sincronizarHistorialCompras({ desde } = {}) {
  const client = getClient();
  const hoy = new Date();
  const endDate = hoy.toISOString().split('T')[0];

  let startDate = desde || null;
  if (!startDate) {
    const ultimaRes = await query('SELECT MAX(fecha_emision) as ultima FROM venta_historico;');
    const ultimaFecha = ultimaRes.rows[0]?.ultima;
    if (ultimaFecha) {
      const margen = new Date(ultimaFecha);
      margen.setDate(margen.getDate() - 2);
      startDate = margen.toISOString().split('T')[0];
    }
  }

  console.log(`🔄 [Catálogo] Sincronizando historial de compras${startDate ? ` desde ${startDate}` : ' (backfill completo)'} → ${endDate}...`);

  let start = 0;
  let totalFacturas = 0;
  let totalLineas = 0;

  while (true) {
    const params = { start, limit: LIMIT_INVOICES_HISTORIAL, order_field: 'date', order_direction: 'DESC' };
    if (startDate) params.date_after = startDate;
    params.date_before = endDate;

    const response = await client.requestWithRetry(() =>
      client.api.get('/invoices', { params, timeout: 60000 })
    );

    const invoices = response.data?.data || response.data || [];
    if (!Array.isArray(invoices) || invoices.length === 0) break;

    // Junta TODAS las líneas de la página en un solo INSERT multi-fila en
    // vez de uno por línea — con ~30 facturas × ~10 líneas cada una, un
    // INSERT por fila significaba ~300 round-trips secuenciales a Supabase
    // por página (varias horas para el histórico completo). Un solo INSERT
    // por página lo baja a un round-trip por página.
    const filas = [];
    for (const invoice of invoices) {
      if (invoice.isVoidedByCreditNote) continue;
      const clienteId = invoice.client?.id;
      if (!clienteId) continue;

      const fecha = (invoice.date || '').split('T')[0];
      if (!fecha) continue;
      const clienteNombre = invoice.client?.name || null;

      // Agrupar líneas repetidas del mismo producto ANTES de insertar.
      const porItem = new Map();
      for (const item of invoice.items || []) {
        if (!item.id) continue;
        const acumulado = porItem.get(item.id) || { cantidad: 0, precioUnitario: 0 };
        acumulado.cantidad += parseFloat(item.quantity) || 0;
        acumulado.precioUnitario = parseFloat(item.price) || acumulado.precioUnitario;
        porItem.set(item.id, acumulado);
      }

      for (const [itemId, datos] of porItem) {
        filas.push([
          parseInt(invoice.id, 10),
          String(itemId),
          String(clienteId),
          clienteNombre,
          datos.cantidad,
          datos.precioUnitario,
          fecha
        ]);
      }
    }

    if (filas.length > 0) {
      await insertarLotesVentaHistorico(filas);
      totalLineas += filas.length;
    }

    totalFacturas += invoices.length;
    if (invoices.length < LIMIT_INVOICES_HISTORIAL) break;
    start += LIMIT_INVOICES_HISTORIAL;
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log(`✅ [Catálogo] Historial de compras sincronizado: ${totalFacturas} facturas, ${totalLineas} líneas procesadas.`);
  return { facturas: totalFacturas, lineas: totalLineas };
}

/**
 * Payload compacto para descarga offline: por cada cliente, sus top 120
 * productos por número de facturas distintas en que aparecen ("veces"),
 * junto a la fecha de la última compra de cada uno. El decaimiento por
 * recencia se calcula en el dispositivo contra la fecha de hoy — no acá —
 * para que el score siga siendo correcto días después de sincronizar.
 *
 * El nombre del cliente se toma el más reciente por cliente_id (no por
 * cliente_nombre): Alegra permite renombrar contactos y el histórico trae
 * más nombres distintos que ids reales.
 */
async function obtenerHistorialParaCatalogo() {
  const result = await query(`
    WITH agregado AS (
      SELECT cliente_id, alegra_item_id,
             COUNT(DISTINCT alegra_invoice_id) AS veces,
             MAX(fecha_emision) AS ultima_compra
      FROM venta_historico
      GROUP BY cliente_id, alegra_item_id
    ),
    nombre_cliente AS (
      SELECT DISTINCT ON (cliente_id) cliente_id, cliente_nombre
      FROM venta_historico
      WHERE cliente_nombre IS NOT NULL
      ORDER BY cliente_id, fecha_emision DESC
    ),
    rankeado AS (
      SELECT a.*, ROW_NUMBER() OVER (PARTITION BY a.cliente_id ORDER BY a.veces DESC, a.ultima_compra DESC) AS rn
      FROM agregado a
    )
    SELECT r.cliente_id, nc.cliente_nombre, r.alegra_item_id, r.veces, r.ultima_compra
    FROM rankeado r
    LEFT JOIN nombre_cliente nc ON nc.cliente_id = r.cliente_id
    WHERE r.rn <= 120
    ORDER BY r.cliente_id, r.veces DESC;
  `);

  const clientesMap = new Map();
  for (const row of result.rows) {
    if (!clientesMap.has(row.cliente_id)) {
      clientesMap.set(row.cliente_id, { id: row.cliente_id, n: row.cliente_nombre || '', p: [] });
    }
    const fechaStr = row.ultima_compra instanceof Date
      ? row.ultima_compra.toISOString().split('T')[0]
      : String(row.ultima_compra).split('T')[0];
    clientesMap.get(row.cliente_id).p.push([row.alegra_item_id, Number(row.veces), fechaStr]);
  }

  return {
    generadoEn: new Date().toISOString().split('T')[0],
    clientes: [...clientesMap.values()]
  };
}

module.exports = {
  listarProductos,
  listarCategorias,
  listarOfertas,
  sincronizarHistorialCompras,
  obtenerHistorialParaCatalogo
};
