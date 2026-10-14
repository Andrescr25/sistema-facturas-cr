/** Las ediciones de una fotografía congelada no pertenecen al pedido nuevo.
 * Un fallo anterior al transporte las conserva disponibles para reintentar;
 * una edición posterior (otro updated_at) sí pertenece a la pantalla actual.
 * Ocultarlas al leer también cubre caídas durante el transporte, antes de
 * que su resultado terminal permita retirar las filas antiguas.
 */
const TEMPORAL_VIGENTE = `NOT EXISTS (
  SELECT 1 FROM bitacora_cambio b JOIN orden_compra_ciclo_envio e ON e.id::text=b.despues->>'clave'
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(b.despues->'temporales','[]'::jsonb)) r
  WHERE b.entidad='orden_compra_ciclo' AND b.accion='revisar_reporte'
    AND e.estado IN ('enviando','incierto','confirmado')
    AND r->>'id'=t.id::text AND t.updated_at=(r->>'actualizado')::timestamp
)`;
module.exports = { TEMPORAL_VIGENTE };
