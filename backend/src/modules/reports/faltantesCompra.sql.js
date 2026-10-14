const { SIN_CREDITO_TOTAL } = require('../facturacion/saldo.sql');

/** Compra actual: una respuesta revisada es final para ESTA factura. Leer
 * historia procesada como necesidad vuelve a pedir lo que ya se resolvió.
 * Validar también la línea propia evita atribuir a un cliente productos ajenos.
 */
function faltanteOperativo(f = 'f', fa = 'fa') {
  return `${f}.estado='pendiente' AND ${f}.tipo_faltante<>'completo'
    AND ${f}.cantidad_faltante>0 AND ${fa}.estado='emitida' AND ${SIN_CREDITO_TOTAL.replace(/\bf\./g, fa + '.')}
    AND EXISTS(SELECT 1 FROM factura_linea l WHERE l.factura_id=${fa}.id AND l.producto_id=${f}.producto_propio_id)
    AND NOT EXISTS(SELECT 1 FROM faltantes_ajustes a WHERE a.faltante_id=${f}.id AND a.revisado)
    AND NOT EXISTS(SELECT 1 FROM (SELECT r.estado FROM facturas_reimpresion r
      WHERE r.factura_propia_id=${fa}.id ORDER BY r.fecha_creacion DESC NULLS LAST,r.id DESC LIMIT 1) cola
      WHERE cola.estado='pendiente')`;
}
const cantidadPendiente = (f = 'f') => `GREATEST(${f}.cantidad_faltante-COALESCE(
  (SELECT a.cantidad_entregada FROM faltantes_ajustes a WHERE a.faltante_id=${f}.id),0),0)`;
const cantidadSinEnviar = (f = 'f') => `GREATEST(${cantidadPendiente(f)}-COALESCE(
  (SELECT SUM(cv.cobertura) FROM orden_compra_ciclo_cobertura cv JOIN orden_compra_ciclo o ON o.id=cv.orden_id
    WHERE cv.faltante_id=${f}.id AND (o.enviada_en IS NOT NULL OR o.envio_id IS NOT NULL)),0),0)`;
module.exports = { faltanteOperativo, cantidadPendiente, cantidadSinEnviar };
