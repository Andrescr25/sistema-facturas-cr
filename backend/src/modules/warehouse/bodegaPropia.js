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
 * EL PUENTE. La línea de tiempo del portal todavía lee el estado de alistado
 * de la tabla vieja `facturas`. Cada factura propia se enlaza a su fila vieja
 * por `facturas.factura_propia_id` (`filaVieja`), y despachar escribe en las
 * dos. Cuando el portal lea `factura`, el puente se retira.
 */

const { query, pool } = require('../../../config/database');
const { enTransaccion: enTransaccionCon } = require('../../utils/transaccion');
const { guardarFaltantes } = require('../../utils/guardarFaltantes');
const { semanaDe } = require('../facturacion/facturaPropia.service');
const { ordenarHistorial } = require('./warehouse.service');
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

/**
 * La fila de la tabla vieja `facturas` de una factura propia, creándola o
 * enlazándola si hace falta. `db` es un cliente de transacción o el módulo
 * de base.
 */
async function filaVieja(facturaId, db = { query }) {
  const ya = await db.query(`SELECT id FROM facturas WHERE factura_propia_id = $1`, [facturaId]);
  if (ya.rows[0]) return ya.rows[0].id;

  const { rows: [f] } = await db.query(`
    SELECT id, numero, alegra_id, estado, cliente_nombre, cliente_correo, fecha::text AS fecha, total
      FROM factura WHERE id = $1
  `, [facturaId]);
  if (!f) throw httpError(404, 'Esa factura no existe.');
  if (f.estado !== 'emitida') throw httpError(409, `La factura ${f.numero || f.id} está ${f.estado}: no se alista.`);

  // Una factura de Alegra cargada en la base propia: su fila vieja es la del
  // mismo id de Alegra, que en las dos tablas es la identidad real.
  if (f.alegra_id) {
    const r = await db.query(
      `UPDATE facturas SET factura_propia_id = $1 WHERE alegra_id = $2::int AND factura_propia_id IS NULL RETURNING id`,
      [f.id, f.alegra_id]
    );
    if (r.rows[0]) return r.rows[0].id;
  }

  // Mismo número: es la misma solo si no está enlazada a otra y no es de
  // OTRA factura de Alegra (ver sección 15 del checklist: la serie propia
  // atrasada choca con números que Alegra ya usó).
  const { rows: [v] } = await db.query(
    `SELECT id, alegra_id, factura_propia_id FROM facturas WHERE numero_factura = $1`, [f.numero]
  );
  if (v) {
    const esLaMisma = v.factura_propia_id === null &&
      (v.alegra_id === null || (f.alegra_id && String(v.alegra_id) === String(f.alegra_id)));
    if (!esLaMisma) {
      throw httpError(409, `El número ${f.numero} ya lo tiene otra factura en la tabla vieja: revisar la serie (sección 15 del checklist).`);
    }
    await db.query(`UPDATE facturas SET factura_propia_id = $1 WHERE id = $2`, [f.id, v.id]);
    return v.id;
  }

  const fecha = f.fecha;
  const nueva = await db.query(`
    INSERT INTO facturas (numero_factura, alegra_id, factura_propia_id, cliente_nombre, cliente_email,
                          fecha_emision, semana, mes, ano, total, estado_bodega)
    VALUES ($1, $2::int, $3, $4, $5, $6, $7, $8, $9, $10, 'pendiente')
    RETURNING id
  `, [
    f.numero, f.alegra_id || null, f.id, f.cliente_nombre, f.cliente_correo || null,
    fecha, semanaDe(fecha), Number(fecha.slice(5, 7)), Number(fecha.slice(0, 4)), Number(f.total) || 0
  ]);
  return nueva.rows[0].id;
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
 * Escribe en `factura` y en su fila vieja en la misma transacción, con la
 * misma hora. Sin faltantes, a la cola de impresión, en la misma transacción:
 * una factura despachada que no llegó a la cola no la vería nadie.
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

    const fila = await filaVieja(facturaId, c);
    // La hora se copia en SQL, no pasando por Node: un Date de JavaScript
    // pierde los microsegundos y las dos quedarían distintas.
    await c.query(`
      UPDATE facturas
         SET estado_bodega = $1,
             bodega_procesado_en = (SELECT bodega_procesado_en FROM factura WHERE id = $2),
             observaciones_adicionales = COALESCE($3::text, observaciones_adicionales)
       WHERE id = $4
    `, [estado, facturaId, observaciones, fila]);

    if (procesado && enviarAImpresion) await encolarSinPendientes(facturaId, c);
    return { factura: f };
  });

  return {
    success: true,
    data: { factura_id: facturaId, estado_bodega: resultado.factura.estado_bodega, despachada_en: resultado.factura.bodega_procesado_en },
    enviada_a_impresion: procesado && enviarAImpresion
  };
}

module.exports = { listar, estados, registrarFaltantes, actualizarEstado, filaVieja, aFactura };
