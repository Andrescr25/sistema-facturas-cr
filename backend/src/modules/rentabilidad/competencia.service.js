/**
 * Capa de servicio de competencia — Fase 3 de la estrategia de precios,
 * dentro del módulo de rentabilidad (a propósito: es la misma pantalla,
 * "qué tan bien están mis precios", solo que mirando hacia afuera en vez
 * de hacia el costo propio). La lógica pesada vive en ./competencia/
 * (adaptadores, matcher, sincronizador, emparejador); acá solo se
 * orquesta para las rutas HTTP.
 */

const { query } = require('../../../config/database');
const { sincronizarLote } = require('./competencia/sincronizador');
const { emparejarPendientes } = require('./competencia/emparejador');
const { importarManual } = require('./competencia/importadorManual');

// Acotado a propósito: una sincronización disparada desde un click de UI no
// puede dejar la petición HTTP colgada varios minutos (1 producto × 3
// fuentes × 2s de rate-limit ≈ 6-9s). Para lotes grandes, correr
// backend/scripts/sincronizar-competencia.js aparte (pensado para cron).
const LIMITE_SYNC_RAPIDO = 15;

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function listarPendientes() {
  const { sugerencias } = await emparejarPendientes();
  return sugerencias;
}

async function confirmarMatch({ fuente, skuExterno, nombreExterno, alegraItemId, confianza }) {
  if (!fuente || !skuExterno || !alegraItemId) {
    throw httpError(400, 'fuente, skuExterno y alegraItemId son requeridos');
  }
  await query(`
    INSERT INTO competencia_mapping (fuente, sku_externo, nombre_externo, alegra_item_id, confianza, origen)
    VALUES ($1, $2, $3, $4, $5, 'manual')
    ON CONFLICT (fuente, sku_externo) DO UPDATE SET
      alegra_item_id = EXCLUDED.alegra_item_id,
      nombre_externo = EXCLUDED.nombre_externo,
      confianza = EXCLUDED.confianza,
      origen = 'manual'
  `, [fuente, skuExterno, nombreExterno || '', alegraItemId, confianza ?? null]);
  return { confirmado: true };
}

async function rechazarMatch({ fuente, skuExterno }) {
  if (!fuente || !skuExterno) throw httpError(400, 'fuente y skuExterno son requeridos');
  await query(
    `INSERT INTO competencia_rechazo (fuente, sku_externo) VALUES ($1, $2) ON CONFLICT (fuente, sku_externo) DO NOTHING`,
    [fuente, skuExterno]
  );
  return { rechazado: true };
}

async function importarListaManual(fuente, filas) {
  if (!fuente) throw httpError(400, 'fuente es requerida');
  if (!Array.isArray(filas) || filas.length === 0) {
    throw httpError(400, 'filas debe ser un array no vacío de {nombre, precio}');
  }
  const resultado = await importarManual(fuente, filas);
  const { sugerencias } = await emparejarPendientes();
  return { ...resultado, sugerenciasGeneradas: sugerencias.length };
}

async function sincronizarRapido({ categoria, limite } = {}) {
  const limiteFinal = Math.min(parseInt(limite, 10) || LIMITE_SYNC_RAPIDO, LIMITE_SYNC_RAPIDO);

  const params = [];
  let filtroCategoria = '';
  if (categoria && categoria !== 'todas') {
    params.push(categoria);
    filtroCategoria = `AND p.category = $${params.length}`;
  }
  params.push(limiteFinal);

  const productos = await query(`
    SELECT p.alegra_id AS "alegraItemId", p.name AS nombre
    FROM alegra_products_cache p
    LEFT JOIN producto_rotacion r ON r.alegra_item_id = p.alegra_id::text
    WHERE p.status = 'active' ${filtroCategoria}
    ORDER BY COALESCE(r.facturacion_12m, 0) DESC
    LIMIT $${params.length}
  `, params);

  if (productos.rows.length === 0) {
    return { productosConsultados: 0, capturas: 0, bloqueos: [], sugerenciasGeneradas: 0 };
  }

  const resumen = await sincronizarLote(productos.rows);
  const { sugerencias } = await emparejarPendientes();

  return { ...resumen, productosConsultados: productos.rows.length, sugerenciasGeneradas: sugerencias.length };
}

/**
 * Mapeos ya confirmados, con el precio más reciente de cada uno — para la
 * pantalla de competencia y para el techo de precio en listarProductos().
 */
async function listarConfirmados() {
  const res = await query(`
    SELECT m.fuente, m.sku_externo, m.nombre_externo, m.alegra_item_id, m.confianza, m.origen,
           p.name AS nombre_propio, p.category AS categoria, p.image_url AS imagen_propia,
           p.price AS precio_propio,
           pc.precio, pc.fecha_captura, pc.imagen_url, pc.url_producto
    FROM competencia_mapping m
    JOIN alegra_products_cache p ON p.alegra_id::text = m.alegra_item_id
    LEFT JOIN LATERAL (
      SELECT precio, fecha_captura, imagen_url, url_producto FROM precio_competencia
      WHERE fuente = m.fuente AND sku_externo = m.sku_externo
      ORDER BY fecha_captura DESC LIMIT 1
    ) pc ON true
    ORDER BY m.created_at DESC
  `);

  return res.rows.map(r => ({
    fuente: r.fuente,
    skuExterno: r.sku_externo,
    nombreExterno: r.nombre_externo,
    alegraItemId: r.alegra_item_id,
    nombrePropio: r.nombre_propio,
    categoria: r.categoria,
    imagenPropia: r.imagen_propia || '',
    precioPropio: r.precio_propio !== null ? Number(r.precio_propio) : null,
    confianza: r.confianza !== null ? Number(r.confianza) : null,
    origen: r.origen,
    precio: r.precio !== null ? Number(r.precio) : null,
    imagenUrl: r.imagen_url || '',
    urlProducto: r.url_producto || '',
    fechaCaptura: r.fecha_captura
  }));
}

module.exports = {
  listarPendientes,
  confirmarMatch,
  rechazarMatch,
  importarListaManual,
  sincronizarRapido,
  listarConfirmados,
  httpError
};
