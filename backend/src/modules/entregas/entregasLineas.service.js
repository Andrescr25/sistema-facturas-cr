/** Una sola lectura de líneas para la operación actual y la consulta histórica.
 * Recibe la conexión para mantener la misma fotografía transaccional.
 */
async function lineasEn(db, facturas, pedidos = []) {
  return (await db.query(`SELECT 'factura' tipo,factura_id documento_id,numero_linea orden,producto_id,nombre,referencia,descripcion,cantidad
    FROM factura_linea WHERE factura_id=ANY($1::int[])
    UNION ALL SELECT 'pedido',pedido_id,id,producto_id,nombre_producto,referencia,NULL,cantidad
    FROM pedido_cliente_linea WHERE pedido_id=ANY($2::int[]) ORDER BY tipo,documento_id,orden`, [facturas,pedidos])).rows;
}
module.exports = { lineasEn };
