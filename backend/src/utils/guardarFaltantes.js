/**
 * Guardar lo que Bodega registró de una factura, producto por producto, en
 * `faltantes` (la tabla vieja, con los ids de `facturas` y `productos`).
 *
 * Estaba adentro de invoice.service.registerMissingItems, que busca la factura
 * por su id de Alegra. Salió acá (2026-09-29, sección 11 del checklist) para
 * que Bodega lo use también con las facturas PROPIAS, que llegan por su fila
 * vieja enlazada (`facturas.factura_propia_id`), sin id de Alegra. Mismo
 * código para los dos caminos: nada de dos copias que se van separando.
 *
 * `item_id`/`producto_codigo`, si llegan, se tratan siempre como referencia,
 * nunca como id de Alegra.
 *
 * @param {number} facturaLocalId  id de la tabla vieja `facturas`
 * @returns {Promise<number>} cuántos se guardaron
 */

const { query } = require('../../config/database');
const { resolverProductoLocal } = require('./resolverProducto');

async function guardarFaltantes(facturaLocalId, faltantes, registradoPor = 'Usuario') {
  let guardados = 0;
  for (const faltante of faltantes) {
    const referencia = faltante.referencia || faltante.item_id || faltante.producto_codigo || null;
    const alegraItemId = faltante.alegra_item_id || null;

    if (!referencia && !alegraItemId) {
      console.warn('⚠️ Faltante sin identificador:', faltante);
      continue;
    }

    const resuelto = await resolverProductoLocal({
      alegraId: alegraItemId,
      referencia,
      nombreFallback: faltante.nombre_producto
    });

    if (!resuelto) {
      console.warn(`⚠️ No se pudo resolver el producto (ref=${referencia}, alegraId=${alegraItemId}), se omite el faltante.`);
      continue;
    }

    const productoId = resuelto.productoId;

    const existente = await query(`
      SELECT id FROM faltantes
      WHERE factura_id = $1 AND producto_id = $2
      LIMIT 1
    `, [facturaLocalId, productoId]);

    if (existente.rows.length > 0) {
      await query(`
        UPDATE faltantes
        SET cantidad_faltante = $1,
            tipo_faltante = $2,
            observaciones = $3,
            registrado_por = $4,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
      `, [
        faltante.cantidad_faltante,
        faltante.tipo_faltante,
        faltante.observaciones || '',
        registradoPor,
        existente.rows[0].id
      ]);
    } else {
      await query(`
        INSERT INTO faltantes (
          factura_id, producto_id, cantidad_faltante, tipo_faltante,
          observaciones, registrado_por, estado
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'pendiente')
      `, [
        facturaLocalId,
        productoId,
        faltante.cantidad_faltante,
        faltante.tipo_faltante,
        faltante.observaciones || '',
        registradoPor
      ]);
    }
    guardados++;
  }
  return guardados;
}

module.exports = { guardarFaltantes };
