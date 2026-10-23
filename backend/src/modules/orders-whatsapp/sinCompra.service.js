const revision = require('./revisionTemporalesProveedor.service');
const { httpError, texto } = require('../../utils/validacion');
const { registrarCambio } = require('../../utils/bitacora');

/**
 * QUITAR UN PRODUCTO DE LAS COMPRAS (2026-10-22). El usuario: «cuando estoy
 * dentro de una orden de compra me deja borrar algún producto, pero estos
 * solo se tachan, necesito poder eliminarlos por completo para ya cerrar esa
 * orden de compra».
 *
 * Antes, borrar dejaba una exclusión temporal: el producto quedaba tachado
 * y, al enviarse el pedido, volvía a aparecer por pedir. Ahora sus faltantes
 * quedan en `faltante_sin_compra` (migración 065) y `faltanteOperativo` ya no
 * los ofrece: salen de Reporte Proveedores y de las órdenes nuevas, y la
 * tarjeta del proveedor se cierra cuando no le queda nada.
 *
 * El faltante del CLIENTE no se toca: Reporte Clientes e Impresión lo siguen
 * resolviendo. Se marca por faltante, no por producto: una venta nueva del
 * mismo producto vuelve a aparecer para comprarse.
 *
 * Como las demás ediciones del reporte, exige la fotografía que vio la
 * pantalla (`revisionReporte`), y solo acepta faltantes que hoy están en la
 * compra de ESE proveedor.
 */
async function quitarDeCompras(datos = {}, usuarioId = null) {
  const proveedor = typeof datos.proveedorNombre === 'string' ? texto(255)(datos.proveedorNombre, 'Proveedor') : null;
  if (!proveedor) throw httpError(400, 'Proveedor: requerido.');
  const crudos = datos.faltanteIds;
  if (!Array.isArray(crudos) || !crudos.length || crudos.length > 500) throw httpError(400, 'Elegí el producto que se quita de las compras.');
  const ids = [...new Set(crudos.map(Number))];
  if (ids.some(id => !Number.isInteger(id) || id <= 0)) throw httpError(400, 'Faltante inválido.');
  const contexto = revision.contexto(datos);
  if (!contexto) throw httpError(400, 'Actualizá el reporte antes de quitar un producto.');

  return revision.enEdicion(async (db) => {
    await revision.comprobarEn(db, proveedor, contexto);
    const reporte = await new (require('../reports/report.service'))()
      .getMissingItemsBySupplier(contexto.fechaInicio, { db, incluirEnviadas: false });
    const fila = reporte.data?.find(p => p.nombre === proveedor || p.aliases?.includes(proveedor));
    const enLaCompra = new Set((fila?.productos_faltantes || []).flatMap(l => (l.origenes || []).map(o => Number(o.faltanteId))));
    if (!ids.every(id => enLaCompra.has(id))) throw httpError(409, 'Ese producto ya no está en la compra de este proveedor. Actualizá el reporte.');

    const usuario = Number.isInteger(Number(usuarioId)) && Number(usuarioId) > 0 ? Number(usuarioId) : null;
    const { rows } = await db.query(`
      INSERT INTO faltante_sin_compra (faltante_id, proveedor_nombre, usuario_id)
      SELECT unnest($1::int[]), $2, $3
      ON CONFLICT (faltante_id) DO NOTHING
      RETURNING faltante_id
    `, [ids, proveedor, usuario]);
    for (const { faltante_id: id } of rows) {
      await registrarCambio(db, {
        entidad: 'faltante', entidadId: id, accion: 'sin_compra', usuarioId: usuario,
        despues: { proveedor }, motivo: 'Reporte Proveedores: quitado de las compras'
      });
    }
    return rows.length;
  });
}

module.exports = { quitarDeCompras };
