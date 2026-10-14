export const ESTADO_FISICO = { por_cargar: 'Por cargar', cargada: 'Cargada', parcialmente_entregada: 'Entrega parcial', entregada: 'Entregada', requiere_revision: 'Requiere revisión' }
export const ACCIONES_FISICAS = { carga: 'Registrar carga', entrega: 'Registrar entrega', descarga: 'Registrar descarga', incidencia: 'Registrar incidencia', revision: 'Revisar registro físico' }

/** Una factura cambiada exige verificar todos los acumulados de nuevo:
 * no reasignar automáticamente carga anterior a una línea reemplazada.
 */
export function prepararCantidades(datos, accion) {
  if (accion !== 'revision') return {}
  return Object.fromEntries(datos.documento.lineas.map(l => {
    const anterior = datos.lineas.find(x => x.numeroLinea === l.numeroLinea && x.productoId === l.productoId)
    return [l.numeroLinea, Object.fromEntries(['cargada', 'entregada', 'descargada'].map(k =>
      [k, String(datos.requiereRevision ? 0 : anterior?.[k] || 0)]))]
  }))
}

export function lineasDeRegistro(datos, accion, cantidades) {
  if (accion === 'incidencia') return []
  if (accion === 'revision') return datos.documento.lineas.map(l => ({ numeroLinea: l.numeroLinea,
    ...Object.fromEntries(['cargada', 'entregada', 'descargada'].map(k => [k, cantidades[l.numeroLinea]?.[k] ?? '0'])) }))
  return datos.lineas.filter(l => Number(cantidades[l.numeroLinea]) > 0)
    .map(l => ({ numeroLinea: l.numeroLinea, cantidad: cantidades[l.numeroLinea] }))
}
