/**
 * Proveedores — a quién se le pide un producto que faltó.
 *
 * Es la asignación A MANO desde el Reporte de Proveedores: "este producto se
 * lo pido a este proveedor". Marca los faltantes PENDIENTES de ese producto.
 *
 * TODO CON IDS PROPIOS, Y SIN SALIR DE LA BASE. Hasta el 2026-10-03 esto vivía
 * en missing-items y, para asignar, le preguntaba el proveedor a Alegra en vivo
 * (`GET /contacts/:id`), lo buscaba POR NOMBRE en la tabla vieja `proveedores`
 * y resolvía el producto contra `alegra_products_cache`. Sin Alegra no se
 * podía asignar a nadie. Ahora el proveedor es una ficha (`proveedor.id`) y el
 * producto es `producto.id`, que es de donde cuelgan los faltantes.
 *
 * EL MAPEO, si existe, se busca por esos dos ids. Sirve para que el pedido
 * salga con el código y el nombre que usa ESE proveedor. Si no hay mapeo —el
 * producto nunca se le compró a ese proveedor— el faltante queda asignado
 * igual, sin mapeo: el pedido sale con el nombre propio.
 */

const { pool } = require('../../../config/database');
const { httpError, idValido } = require('../../utils/validacion');
const { enTransaccion } = require('../../utils/transaccion');
const { AHORA_CR_SQL } = require('../../utils/fechaCR');
const { JOIN_CICLO, filtrosOperacion } = require('../rutas/operacionCiclo.service');

/**
 * @param {{productoId: number, proveedorId: number, cicloId?: number|'sin-ciclo'}} datos
 * @returns {Promise<{proveedor: string, faltantesActualizados: number, mappingId: string|null}>}
 */
async function asignarProveedorAProducto({ productoId, proveedorId, cicloId } = {}) {
  const idProducto = idValido(productoId);
  const idProveedor = idValido(proveedorId);
  const params = [];
  // Omitir el ámbito conserva el contrato global anterior. Un ámbito vacío
  // explícito nunca debe convertirse silenciosamente en una asignación global.
  if (cicloId !== undefined && (cicloId === null || cicloId === '')) throw httpError(400, 'Seleccioná un ciclo o Sin ciclo.');
  const { where } = filtrosOperacion({ cicloId }, [], params);

  return enTransaccion(pool, async (db) => {
    if (cicloId !== undefined && cicloId !== 'sin-ciclo') {
      const existe = await db.query('SELECT id FROM ciclo_ruta WHERE id=$1', [Number(cicloId)]);
      if (!existe.rowCount) throw httpError(404, 'Ese ciclo no existe.');
    }
    const { rows: [proveedor] } = await db.query(
      'SELECT id, nombre, identificacion, activo FROM proveedor WHERE id = $1', [idProveedor]);
    if (!proveedor) throw httpError(404, 'Ese proveedor no existe.');
    if (!proveedor.activo) throw httpError(409, `${proveedor.nombre} está inactivo. Reactivalo en sus datos antes de asignarle productos.`);

    const { rows: [producto] } = await db.query('SELECT id FROM producto WHERE id = $1', [idProducto]);
    if (!producto) throw httpError(404, 'Ese producto no existe.');

    const { rows: [mapeo] } = await db.query(`
      SELECT id FROM supplier_product_mapping
       WHERE producto_id = $1 AND proveedor_id = $2
       ORDER BY last_used_date DESC NULLS LAST
       LIMIT 1`, [idProducto, idProveedor]);

    const { rowCount } = await db.query(`
      UPDATE faltantes
         SET proveedor_asignado = $1,
             proveedor_cedula = $2,
             asignacion_tipo = 'manual',
             fecha_asignacion = ${AHORA_CR_SQL},
             mapping_id = $3
       WHERE producto_propio_id = $4 AND estado = 'pendiente'
         ${where.length ? `AND factura_propia_id IN (SELECT f.id FROM factura f ${JOIN_CICLO('f')}
           WHERE ${where.join(' AND ').replace(/\$(\d+)/g, (_, n) => '$' + (Number(n) + 4))})` : ''}`,
      [proveedor.nombre.trim(), proveedor.identificacion || null, mapeo?.id || null, idProducto, ...params]);

    return { proveedor: proveedor.nombre.trim(), faltantesActualizados: rowCount, mappingId: mapeo?.id || null };
  });
}

module.exports = { asignarProveedorAProducto };
