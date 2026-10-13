/**
 * Guardar lo que Bodega registró de una factura, producto por producto, en
 * `faltantes`, colgado de la factura PROPIA (`factura.id`) y del producto
 * propio (`producto.id`) — migración independencia/032.
 *
 * Hasta el 2026-09-30 recibía el id de la tabla vieja `facturas` y resolvía
 * el producto contra la tabla vieja `productos`. Las dos columnas viejas se
 * renombraron (`factura_vieja_id`, `producto_viejo_id`) para que nada vuelva
 * a escribir ahí sin que salte.
 *
 * EL PRODUCTO se toma, en este orden:
 *  1. `producto_id` — el id propio, que la pantalla de Bodega ya conoce
 *     porque las líneas de la factura propia lo traen.
 *  2. `alegra_item_id` — solo para líneas viejas que no lo tengan; en
 *     `producto` es único.
 *  3. `referencia` — y solo si calza con UN producto: con dos se estaría
 *     eligiendo al azar.
 * `item_id`/`producto_codigo`, si llegan, se tratan siempre como referencia,
 * nunca como id.
 *
 * @param {number} facturaId  id de `factura` (la propia)
 * @returns {Promise<number>} cuántos se guardaron
 */

const { query } = require('../../config/database');
const { AHORA_CR_SQL } = require('./fechaCR');

const entero = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** El id propio del producto de una línea de faltante, o null. */
async function productoPropioDe(faltante, db = { query }) {
  const productoId = entero(faltante.producto_id);
  if (productoId) {
    const { rows } = await db.query('SELECT id FROM producto WHERE id = $1', [productoId]);
    if (rows[0]) return rows[0].id;
  }

  const alegraItemId = faltante.alegra_item_id ? String(faltante.alegra_item_id).trim() : '';
  if (alegraItemId) {
    const { rows } = await db.query('SELECT id FROM producto WHERE alegra_id = $1', [alegraItemId]);
    if (rows[0]) return rows[0].id;
  }

  const referencia = String(faltante.referencia || faltante.item_id || faltante.producto_codigo || '').trim();
  if (referencia) {
    const { rows } = await db.query('SELECT id FROM producto WHERE referencia = $1 LIMIT 2', [referencia]);
    if (rows.length === 1) return rows[0].id;
  }

  return null;
}

async function guardarFaltantes(facturaId, faltantes, registradoPor = 'Usuario', db = { query }, detectados = []) {
  let guardados = 0;
  for (const faltante of faltantes) {
    const productoId = await productoPropioDe(faltante, db);
    if (!productoId) {
      console.warn('⚠️ No se encontró el producto del faltante, se omite:', {
        producto_id: faltante.producto_id, alegra_item_id: faltante.alegra_item_id, referencia: faltante.referencia
      });
      continue;
    }

    const existente = await db.query(`
      SELECT id,cantidad_faltante,tipo_faltante FROM faltantes
      WHERE factura_propia_id = $1 AND producto_propio_id = $2
      LIMIT 1
    `, [facturaId, productoId]);

    let faltanteId = existente.rows[0]?.id;
    const anterior = existente.rows[0]?.tipo_faltante === 'completo' ? 0 : existente.rows[0]?.cantidad_faltante || 0;
    if (existente.rows.length > 0) {
      await db.query(`
        UPDATE faltantes
        SET cantidad_faltante = $1,
            tipo_faltante = $2,
            observaciones = $3,
            registrado_por = $4,
            updated_at = ${AHORA_CR_SQL}
        WHERE id = $5
      `, [
        faltante.cantidad_faltante,
        faltante.tipo_faltante,
        faltante.observaciones || '',
        registradoPor,
        existente.rows[0].id
      ]);
    } else {
      const { rows: [nuevo] } = await db.query(`
        INSERT INTO faltantes (
          factura_propia_id, producto_propio_id, cantidad_faltante, tipo_faltante,
          observaciones, registrado_por, estado, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'pendiente', ${AHORA_CR_SQL}, ${AHORA_CR_SQL}) RETURNING id
      `, [
        facturaId,
        productoId,
        faltante.cantidad_faltante,
        faltante.tipo_faltante,
        faltante.observaciones || '',
        registradoPor
      ]);
      faltanteId = nuevo.id;
    }
    detectados.push({ id: faltanteId, productoId, anterior, cantidad: faltante.tipo_faltante === 'completo' ? 0 : faltante.cantidad_faltante });
    guardados++;
  }
  return guardados;
}

module.exports = { guardarFaltantes, productoPropioDe };
