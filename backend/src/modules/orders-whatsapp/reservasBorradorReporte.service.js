const { registrarCambio } = require('../../utils/bitacora');
const { interno:{obtenerEn} } = require('./ordenesCiclo.service');

/** La asignación vigente manda sobre una reserva antigua SIN envío. Cerrar
 * ese borrador conserva líneas, orígenes y PDF; sus otros faltantes siguen
 * pendientes en el reporte y se revisan cuando se compra a ese proveedor.
 * Se llama bajo el advisory de compra y los bloqueos factura→faltante.
 * Nunca liberar cobertura enviada o un intento por verificar.
 */
async function liberarReasignadasEn(db,proveedorId,faltantes,usuarioId) {
  const { rows } = await db.query(`SELECT o.id,
    ARRAY(SELECT DISTINCT r.faltante_id FROM orden_compra_ciclo_origen r
      JOIN orden_compra_ciclo_linea l ON l.id=r.linea_id
      WHERE l.orden_id=o.id AND r.faltante_id=ANY($2::int[])) faltantes
    FROM orden_compra_ciclo o WHERE o.proveedor_id<>$1
      AND o.estado IN ('borrador','pendiente_enviar')
      AND o.envio_id IS NULL AND o.enviada_en IS NULL
      AND NOT EXISTS(SELECT 1 FROM orden_compra_ciclo_envio e WHERE e.orden_id=o.id
        AND e.estado IN ('enviando','incierto','confirmado'))
      AND EXISTS(SELECT 1 FROM orden_compra_ciclo_origen r
        JOIN orden_compra_ciclo_linea l ON l.id=r.linea_id
        WHERE l.orden_id=o.id AND r.faltante_id=ANY($2::int[]))
    ORDER BY o.id FOR UPDATE OF o`,[proveedorId,faltantes]);
  for (const r of rows) {
    const anterior=await obtenerEn(db,r.id);
    const motivo='Borrador sustituido: sus faltantes fueron reasignados a otro proveedor y revisados en Reporte Proveedores.';
    await db.query(`UPDATE orden_compra_ciclo SET estado='cerrada',motivo_cierre=$2,
      cerrada_en=NOW(),version=version+1,actualizado_en=NOW() WHERE id=$1`,[r.id,motivo]);
    await registrarCambio(db,{entidad:'orden_compra_ciclo',entidadId:r.id,accion:'cerrada',
      antes:anterior,despues:{estado:'cerrada',proveedorDestino:proveedorId,faltantesReasignados:r.faltantes},usuarioId,motivo});
  }
}
module.exports = { liberarReasignadasEn };
