const { httpError } = require('../../utils/validacion');

/** Los mismos snapshots y restricciones de las líneas individuales, en dos
 * consultas por lote. Se llama con la orden/faltantes bloqueados: agrupar
 * escrituras no cambia la cobertura ni permite reservar una necesidad dos veces.
 */
async function insertarLineasEn(db,o,entradas) {
  if (!entradas.length) return [];
  const { interno:{micros,cantidadDe} } = require('./ordenesCiclo.service');
  const filas=entradas.map(({l,producto,previa})=>{
    if (!producto || producto.disponible<=0) throw httpError(409,'Un producto ya no tiene faltantes libres. Revisá la orden.');
    const factor=previa?.factor_conversion??producto.factorConversion;
    if (!Number.isFinite(factor)||factor<0.000001||factor>1000000) throw httpError(409,'Corregí la conversión del producto antes de preparar su orden.');
    return { producto_id:l.productoId,producto_nombre:previa?.producto_nombre??producto.nombre,
      codigo_interno:previa?previa.codigo_interno:producto.codigo,codigo_proveedor:previa?previa.codigo_proveedor:producto.codigoProveedor,
      nombre_proveedor:previa?previa.nombre_proveedor:producto.nombreProveedor,mapping_id:previa?previa.mapping_id:producto.mappingId,
      factor_conversion:factor,cantidad_proveedor:l.cantidadProveedor };
  });
  const { rows:lineas }=await db.query(`INSERT INTO orden_compra_ciclo_linea(orden_id,producto_id,producto_nombre,codigo_interno,codigo_proveedor,nombre_proveedor,mapping_id,factor_conversion,cantidad_proveedor)
    SELECT $1,x.producto_id,x.producto_nombre,x.codigo_interno,x.codigo_proveedor,x.nombre_proveedor,x.mapping_id,x.factor_conversion,x.cantidad_proveedor
    FROM jsonb_to_recordset($2::jsonb) AS x(producto_id int,producto_nombre text,codigo_interno text,codigo_proveedor text,nombre_proveedor text,mapping_id uuid,factor_conversion numeric,cantidad_proveedor int)
    RETURNING *`,[o.id,JSON.stringify(filas)]);
  const porProducto=new Map(lineas.map(l=>[l.producto_id,l])),origenes=[];
  for (const {l,producto} of entradas) {
    const nueva=porProducto.get(l.productoId);
    let disponible=micros(nueva.cantidad_propia);
    for (const f of producto.origenes) {
      const libre=micros(f.disponible),cantidad=disponible<libre?disponible:libre;
      if (cantidad<=0n) continue;
      origenes.push({linea_id:nueva.id,faltante_id:f.faltanteId,factura_id:f.facturaId,factura_numero:f.numero,
        cliente_id:f.cliente_id,cliente_nombre:f.cliente_nombre,orden_visita:f.orden,anticipado:f.preventa_anticipada,cantidad:cantidadDe(cantidad)});
      disponible-=cantidad;
    }
  }
  if (origenes.length) await db.query(`INSERT INTO orden_compra_ciclo_origen(linea_id,faltante_id,factura_id,factura_numero,cliente_id,cliente_nombre,orden_visita,anticipado,cantidad)
    SELECT x.linea_id,x.faltante_id,x.factura_id,x.factura_numero,x.cliente_id,x.cliente_nombre,x.orden_visita,x.anticipado,x.cantidad
    FROM jsonb_to_recordset($1::jsonb) AS x(linea_id int,faltante_id int,factura_id int,factura_numero text,cliente_id int,cliente_nombre text,orden_visita int,anticipado boolean,cantidad numeric)`,[JSON.stringify(origenes)]);
  return lineas;
}

module.exports={insertarLineasEn};
