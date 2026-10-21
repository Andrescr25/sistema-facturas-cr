/** Las enviadas son fotografías separadas, nunca faltantes actuales. Leer
 * cabeceras/líneas directamente evita bloquear una consulta del reporte.
 *
 * A LOS 3 DÍAS SALEN DEL REPORTE (pedido del usuario, 2026-10-20: «las
 * ordenes de compra que ya fueron enviadas y tienen mas de 3 dias de enviadas
 * se pueden eliminar»). Se dejan de mostrar, no se borran: su cobertura sigue
 * descontando de «por pedir» (cantidadSinEnviar en faltantesCompra.sql.js), y
 * borrarlas haría volver esos productos como faltantes para pedirlos otra vez.
 * La que quedó sin confirmar (enviando/incierto) sigue a la vista hasta que
 * alguien la resuelva. `ahora` solo existe para las pruebas.
 */
const DIAS_VISIBLE = 3;

async function enviadasEn(db, { fechaInicio, ahora = null } = {}) {
  const { rows: ordenes } = await db.query(`SELECT o.*,p.nombre nombre_actual,
    e.estado envio_estado FROM orden_compra_ciclo_operativa o JOIN proveedor p ON p.id=o.proveedor_id
    JOIN orden_compra_ciclo_envio e ON e.id=o.envio_id
    WHERE (o.enviada_en IS NOT NULL OR e.estado IN ('enviando','incierto'))
      AND (o.enviada_en IS NULL OR o.enviada_en > COALESCE($2::timestamptz, NOW()) - make_interval(days => $3))
      AND NOT o.archivada AND o.estado<>'cerrada'
      AND ($1::date IS NULL OR COALESCE(o.enviada_en,e.iniciado_en)::date>=$1)
    ORDER BY o.id DESC`, [fechaInicio || null, ahora, DIAS_VISIBLE]);
  if (!ordenes.length) return [];
  const { rows: lineas } = await db.query(`SELECT l.* FROM orden_compra_ciclo_linea l
    WHERE orden_id=ANY($1::int[]) ORDER BY l.id`, [ordenes.map(o => o.id)]);
  const resultados = [];
  for (const o of ordenes) {
    // Sin «facturado/parcial» por producto desde el 2026-10-20: lo que llega
    // ya no se enlaza a la orden, así que no hay con qué compararla.
    const productos = lineas.filter(l => l.orden_id === o.id).map(l => ({
      producto_id:l.producto_id, nombre:l.producto_nombre, codigo:l.codigo_interno,
      codigo_proveedor:l.codigo_proveedor, nombre_proveedor:l.nombre_proveedor,
      cantidad_faltante:Number(l.cantidad_propia), cantidad_proveedor:l.cantidad_proveedor,
      factor_conversion:Number(l.factor_conversion), origenes:[]
    }));
    resultados.push({ id:`orden-${o.id}`, orden_id:o.id, proveedor_id:o.proveedor_id,
      cedula:o.proveedor_cedula, nombre:o.proveedor_nombre, contacto:o.proveedor_cedula,
      enviada:true, enviada_en:o.enviada_en, estado_envio:o.enviada_en?'enviada':'incierto',
      productos_faltantes:productos, total_productos:productos.length,
      total_cantidad:productos.reduce((s,p) => s+p.cantidad_faltante,0) });
  }
  return resultados;
}
module.exports = { enviadasEn, DIAS_VISIBLE };
