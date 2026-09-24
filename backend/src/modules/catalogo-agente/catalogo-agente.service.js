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
const { getClient } = require('../../integrations/alegra');
const { ofertasPorBajaDePrecio } = require('../precios/ofertasPorBaja');
const { query } = require('../../../config/database');
const { listarVigentes } = require('../../utils/descuentosExceso');
const { hoyEnCostaRica } = require('../../utils/fechaCR');
const categoriasConfig = require('../catalogo/categorias.service');
const subcategoriasConfig = require('../catalogo/subcategorias.service');

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
 * Borra de venta_historico las líneas que ya NO están en la factura.
 *
 * Una factura editada en Alegra (se le quita un producto, se le corrige una
 * cantidad) nunca vuelve a mandar esa línea vieja: el upsert de arriba
 * actualiza o agrega, pero nada la borra. Sin este paso esa línea queda
 * huérfana para siempre y se sigue sumando en cada total que lea
 * venta_historico — así se detectó: una factura de ₡279.113 en Alegra
 * aparecía en ₡316.566 en "Volver a pedir" del catálogo de clientes, con dos
 * productos de una edición anterior todavía contados.
 *
 * `paresPorFactura` es el mapa EXACTO de qué (factura, producto) siguen
 * siendo válidos según la respuesta que Alegra acaba de dar — el mismo que
 * ya se usó para armar `filas`. Cualquier fila en la base con esa
 * alegra_invoice_id que no esté en ese mapa dejó de existir en la factura.
 */
async function eliminarLineasObsoletas(paresPorFactura) {
  const facturaIds = [...paresPorFactura.keys()];
  if (facturaIds.length === 0) return 0;

  const paresValidos = [];
  for (const [facturaId, itemIds] of paresPorFactura) {
    for (const itemId of itemIds) paresValidos.push([facturaId, itemId]);
  }

  // Ninguna de las facturas de esta página tiene ítems: se borra todo lo que
  // hubiera quedado de ellas. No se puede armar un VALUES() vacío.
  if (paresValidos.length === 0) {
    const r = await query(`DELETE FROM venta_historico WHERE alegra_invoice_id = ANY($1::integer[]) RETURNING 1;`, [facturaIds]);
    return r.rows.length;
  }

  const placeholders = paresValidos.map((_, i) => `($${i * 2 + 1}::integer, $${i * 2 + 2}::varchar)`).join(', ');
  const valores = paresValidos.flat();

  const r = await query(`
    DELETE FROM venta_historico t
    WHERE t.alegra_invoice_id = ANY($${valores.length + 1}::integer[])
      AND NOT EXISTS (
        SELECT 1 FROM (VALUES ${placeholders}) AS v(invoice_id, item_id)
        WHERE v.invoice_id = t.alegra_invoice_id AND v.item_id = t.alegra_item_id
      )
    RETURNING 1;
  `, [...valores, facturaIds]);
  return r.rows.length;
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
      client.api.get('/invoices', { params, timeout: 60000 }),
      3, 1000, { metodo: 'GET' }
    );

    const invoices = response.data?.data || response.data || [];
    if (!Array.isArray(invoices) || invoices.length === 0) break;

    // Junta TODAS las líneas de la página en un solo INSERT multi-fila en
    // vez de uno por línea — con ~30 facturas × ~10 líneas cada una, un
    // INSERT por fila significaba ~300 round-trips secuenciales a Supabase
    // por página (varias horas para el histórico completo). Un solo INSERT
    // por página lo baja a un round-trip por página.
    const filas = [];
    // Qué (factura, producto) son válidos SEGÚN ESTA RESPUESTA de Alegra,
    // factura por factura — para poder borrar después lo que ya no está
    // (ver eliminarLineasObsoletas). Solo se listan las facturas que de
    // verdad se procesan: una voidedByCreditNote o sin cliente/fecha no
    // entra al mapa y sus filas viejas, si las hay, no se tocan.
    const paresPorFactura = new Map();
    for (const invoice of invoices) {
      if (invoice.isVoidedByCreditNote) continue;
      const clienteId = invoice.client?.id;
      if (!clienteId) continue;

      const fecha = (invoice.date || '').split('T')[0];
      if (!fecha) continue;
      const clienteNombre = invoice.client?.name || null;
      const facturaId = parseInt(invoice.id, 10);

      // Agrupar líneas repetidas del mismo producto ANTES de insertar.
      const porItem = new Map();
      for (const item of invoice.items || []) {
        if (!item.id) continue;
        const acumulado = porItem.get(item.id) || { cantidad: 0, precioUnitario: 0 };
        acumulado.cantidad += parseFloat(item.quantity) || 0;
        acumulado.precioUnitario = parseFloat(item.price) || acumulado.precioUnitario;
        porItem.set(item.id, acumulado);
      }

      paresPorFactura.set(facturaId, new Set([...porItem.keys()].map(String)));

      for (const [itemId, datos] of porItem) {
        filas.push([
          facturaId,
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
    await eliminarLineasObsoletas(paresPorFactura);

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

module.exports = {
  conSubcategoria,
  listarProductos,
  listarCategorias,
  listarOfertas,
  listarOfertasPorBaja,
  sincronizarHistorialCompras,
  obtenerHistorialParaCatalogo,
  eliminarLineasObsoletas,
  obtenerConfigCatalogo
};
