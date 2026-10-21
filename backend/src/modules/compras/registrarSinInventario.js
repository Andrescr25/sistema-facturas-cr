/** Servicios recurrentes y gastos operativos comparten UNA compra documental.
 * Las cantidades originales se conservan; producto_id NULL impide mover stock.
 * Quien llama ya bloqueó el buzón y decide cómo se paga y clasifica.
 */
async function registrarSinInventario(db, factura, proveedorId, usuarioId = null) {
  const { rows } = await db.query(
    `INSERT INTO compra (proveedor_id, clave, numero_consecutivo, fecha_emision,
       fecha_vencimiento, moneda, total, estado, factura_proveedor_id, xml_ruta,
       total_otros_cargos, total_descuentos, total_iva_devuelto, otros_cargos, registrada_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'registrada',$8,$9,$10,$11,$12,$13::jsonb,$14) RETURNING *`,
    [proveedorId, factura.clave, factura.numero_consecutivo, factura.fecha_emision,
      factura.fecha_vencimiento, factura.moneda || 'CRC', factura.total_factura,
      factura.id, factura.xml_ruta, factura.total_otros_cargos, factura.total_descuentos,
      factura.total_iva_devuelto, JSON.stringify(factura.otros_cargos || []), usuarioId]
  );
  const compra = rows[0];
  const detalle = await db.query(
    `INSERT INTO compra_linea (compra_id, numero_linea, producto_id, descripcion,
       codigo_proveedor, codigo_cabys, cantidad, unidad, factor_conversion,
       precio_unitario, descuento, impuesto, total_linea)
     SELECT $1, numero_linea, NULL, descripcion, codigo_proveedor, codigo_cabys,
       cantidad, unidad_medida, 1, precio_unitario, COALESCE(descuento,0),
       COALESCE(impuesto,0), total_linea
       FROM productos_factura_proveedor WHERE factura_id=$2 ORDER BY numero_linea`,
    [compra.id, factura.id]
  );
  if (!detalle.rowCount) throw new Error('La factura no tiene ninguna línea.');
  return compra;
}

module.exports = { registrarSinInventario };
