/**
 * Facturas en Bodega sobre la factura PROPIA (sección 11 del checklist,
 * paso 1; rama independencia-alegra, 2026-09-29).
 *
 * Antes la lista se le pedía a Alegra en vivo y el estado de alistado vivía en
 * la tabla vieja `facturas`, buscado por `alegra_id`: una factura hecha en el
 * sistema no aparecía para alistar. Ahora:
 *
 *  - La lista sale de `factura` (solo EMITIDAS: ni proformas ni anuladas) con
 *    sus líneas de `factura_linea`, en la misma forma que ya dibujaba la
 *    pantalla, pero con `factura_id` —el id propio— como identidad. Nunca
 *    `alegra_id`: los dos son números y pasar uno por el otro abre OTRA
 *    factura sin dar error (leccion/ids-propios-y-de-alegra-no-se-mezclan).
 *  - El estado de alistado se guarda en `factura` (migración 031).
 *
 *  - Los faltantes y la cola de impresión cuelgan de `factura.id` y
 *    `producto.id` (migración 032, pasos 2 y 3).
 *
 * SIN PUENTE (2026-09-30). Hasta acá cada despacho se copiaba también a la
 * tabla vieja `facturas` (enlazada por `factura_propia_id`), porque
 * Faltantes, la cola de impresión y el portal la leían. Ya leen `factura`:
 * despachar escribe solo acá.
 */

const { query, pool } = require('../../../config/database');
const { enTransaccion: enTransaccionCon } = require('../../utils/transaccion');
const { guardarFaltantes } = require('../../utils/guardarFaltantes');
const { encolarSinPendientes } = require('../reprinting/colaImpresion');

const HOY_CR = `(now() AT TIME ZONE 'America/Costa_Rica')::date`;
const enTransaccion = (trabajo) => enTransaccionCon(pool, trabajo);

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function idDeFactura(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'Factura inválida.');
  return id;
}

const acotar = (v, min, max, porDefecto) => {
  const n = parseInt(v, 10);
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : porDefecto;
};

function aLinea(l) {
  const alegra = l.alegra_item_id ? String(l.alegra_item_id) : null;
  const cantidad = Number(l.cantidad) || 0;
  return {
    // El id PROPIO del producto va con su nombre; `alegra_id` es el del
    // producto en Alegra (el que usan los faltantes hasta el paso 3). Sin
    // `id` suelto a propósito: el borrador de bodega lo tomaba como id de
    // Alegra cuando faltaba el otro.
    producto_id: l.producto_id,
    alegra_id: alegra,
    codigo_alegra: alegra,
    nombre: l.nombre,
    name: l.nombre,
    descripcion: l.descripcion || '',
    description: l.descripcion || '',
    referencia: l.referencia || null,
    reference: l.referencia || null,
    codigo_producto: l.referencia || null,
    cantidad,
    quantity: cantidad
  };
}

function aFactura(f, lineas) {
  return {
    factura_id: f.id,
    numero_factura: f.numero,
    numero_completo: f.numero,
    cliente_nombre: f.cliente_nombre,
    cliente_email: f.cliente_correo || null,
    fecha_emision: f.fecha,
    total: Number(f.total) || 0,
    observaciones: f.observaciones || null,
    estado_bodega: f.estado_bodega,
    observaciones_adicionales: f.bodega_observaciones || null,
    despachada_en: f.bodega_procesado_en || null,
    items: lineas.map(aLinea)
  };
}

/**
 * El historial en ORDEN DE DESPACHO: la última factura despachada primero, la
 * anterior segunda, y así. Las despachadas antes de que existiera la hora
 * (antes del 25 de agosto) van al final, por fecha de emisión.
 */
function ordenarHistorial(listas) {
  return [...listas].sort((a, b) => {
    const ta = a.despachada_en ? new Date(a.despachada_en).getTime() : null;
    const tb = b.despachada_en ? new Date(b.despachada_en).getTime() : null;
    if (ta !== null && tb !== null) return tb - ta;
    if (ta !== null) return -1;
    if (tb !== null) return 1;
    return String(b.fecha_emision || '').localeCompare(String(a.fecha_emision || ''));
  });
}

/**
 * GET /bodega/facturas-propias?dias=&limit= — la misma ventana que usaba la
 * pantalla con Alegra: las `limit` más nuevas de los últimos `dias` días.
 */
async function listar({ dias, limit } = {}) {
  const d = acotar(dias, 1, 365, 30);
  const l = acotar(limit, 1, 500, 40);
  const { rows: facturas } = await query(`
    SELECT f.id, f.numero, f.fecha::text AS fecha, f.cliente_nombre, f.cliente_correo, f.total,
           f.observaciones, f.estado_bodega, f.bodega_procesado_en, f.bodega_observaciones
      FROM factura f
     WHERE f.estado = 'emitida'
       AND f.fecha >= ${HOY_CR} - $1::int
     ORDER BY f.fecha DESC, f.id DESC
     LIMIT $2
  `, [d, l]);

  const ids = facturas.map((f) => f.id);
  const porFactura = new Map(ids.map((id) => [id, []]));
  if (ids.length > 0) {
    const { rows: lineas } = await query(`
      SELECT l.factura_id, l.numero_linea, l.producto_id, l.nombre, l.referencia, l.descripcion,
             l.cantidad, l.alegra_item_id
        FROM factura_linea l
       WHERE l.factura_id = ANY($1::int[])
       ORDER BY l.factura_id, l.numero_linea
    `, [ids]);
    for (const linea of lineas) porFactura.get(linea.factura_id)?.push(linea);
  }

  const todas = facturas.map((f) => aFactura(f, porFactura.get(f.id) || []));
  const pendientes = todas.filter((f) => f.estado_bodega !== 'procesado');
  const listas = ordenarHistorial(todas.filter((f) => f.estado_bodega === 'procesado'));

  return {
    success: true,
    data: { pendientes, listas, resumen: { total: todas.length, pendientes: pendientes.length, listas: listas.length } },
    // Ya no hay nadie a quien esperar: la lista es de la base, siempre al día.
    metadata: { filtros: { dias: d, limit: l }, lastSync: new Date().toISOString(), actualizando: false, aviso: null }
  };
}

/** GET /bodega/facturas-propias/:facturaId/estados — lo registrado, producto por producto. */
async function estados(facturaIdCrudo) {
  const facturaId = idDeFactura(facturaIdCrudo);
  const { rows } = await query(`
    SELECT f.tipo_faltante, f.cantidad_faltante, f.observaciones,
           p.id AS producto_id, p.referencia, p.alegra_id AS alegra_item_id
      FROM faltantes f
      JOIN producto p ON p.id = f.producto_propio_id
     WHERE f.factura_propia_id = $1
  `, [facturaId]);
  return rows.map((r) => ({
    productoId: r.producto_id,
    referencia: r.referencia ? String(r.referencia).trim() : null,
    alegraItemId: r.alegra_item_id ? String(r.alegra_item_id).trim() : null,
    tipoFaltante: r.tipo_faltante,
    cantidadFaltante: Number(r.cantidad_faltante) || 0,
    observaciones: r.observaciones || ''
  }));
}

/** POST /bodega/facturas-propias/:facturaId/faltantes — lo que se registró al despachar. */
async function registrarFaltantes(facturaIdCrudo, faltantes, registradoPor = 'Bodega') {
  const facturaId = idDeFactura(facturaIdCrudo);
  if (!Array.isArray(faltantes)) throw httpError(400, 'No vino la lista de productos.');
  const { rows: [f] } = await query('SELECT numero, estado FROM factura WHERE id = $1', [facturaId]);
  if (!f) throw httpError(404, 'Esa factura no existe.');
  if (f.estado !== 'emitida') throw httpError(409, `La factura ${f.numero || facturaId} está ${f.estado}: no se alista.`);
  const guardados = await guardarFaltantes(facturaId, faltantes, registradoPor);
  return { factura_id: facturaId, faltantes_registrados: guardados };
}

/**
 * POST /bodega/facturas-propias/:facturaId/estado — despachar (o reabrir).
 * Sin faltantes, a la cola de impresión, en la misma transacción: una factura
 * despachada que no llegó a la cola no la vería nadie.
 */
async function actualizarEstado(facturaIdCrudo, { estado, observaciones = null, enviarAImpresion = false } = {}) {
  const facturaId = idDeFactura(facturaIdCrudo);
  if (!['pendiente', 'procesado'].includes(estado)) throw httpError(400, 'Estado inválido. Usa "pendiente" o "procesado".');
  const procesado = estado === 'procesado';

  const resultado = await enTransaccion(async (c) => {
    const { rows: [f] } = await c.query(`
      UPDATE factura
         SET estado_bodega = $1,
             bodega_procesado_en = CASE WHEN $2::boolean THEN CURRENT_TIMESTAMP ELSE NULL END,
             bodega_observaciones = COALESCE($3::text, bodega_observaciones)
       WHERE id = $4 AND estado = 'emitida'
       RETURNING id, numero, estado_bodega, bodega_procesado_en, bodega_observaciones
    `, [estado, procesado, observaciones, facturaId]);
    if (!f) throw httpError(404, 'Esa factura no existe o no está emitida.');

    if (procesado && enviarAImpresion) await encolarSinPendientes(facturaId, c);
    return { factura: f };
  });

  return {
    success: true,
    data: { factura_id: facturaId, estado_bodega: resultado.factura.estado_bodega, despachada_en: resultado.factura.bodega_procesado_en },
    enviada_a_impresion: procesado && enviarAImpresion
  };
}

module.exports = { listar, estados, registrarFaltantes, actualizarEstado, aFactura, ordenarHistorial };
