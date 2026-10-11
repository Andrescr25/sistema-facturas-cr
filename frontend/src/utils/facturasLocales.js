/** Copias de facturas: número, cliente, líneas y estados del sistema propio. */
const numero = v => Number(v) || 0
const dia = v => typeof v === 'string' ? v.slice(0, 10) : v

/** POST/PUT devuelve la fila SQL; GET devuelve la vista propia calculada. */
export function facturaEscrita(f) {
  if (!f) return f
  // null confirma Sin ciclo; undefined indica un dato aún sin descargar.
  // Una respuesta parcial tampoco debe borrar la marca anticipada.
  const contexto = { ciclo: f.ciclo, historica: f.alegra_id === undefined ? undefined : Boolean(f.alegra_id), anticipado: f.preventa_anticipada === undefined
    ? undefined : Boolean(f.preventa_anticipada) }
  // Idempotencia puede contestar solo id/número. Ese acuse no borra la ficha
  // y las líneas que ya estaban descargadas en la tablet.
  if (f.yaExistia) return { id: f.id, numero: f.numero, estado: f.estado, ...contexto, esPropia: true, yaExistia: true }
  return {
    id: f.id, ...contexto, numero: f.numero, serie: f.serie, consecutivo: f.consecutivo,
    estado: f.estado || 'emitida', fecha: dia(f.fecha), fechaVencimiento: dia(f.fecha_vencimiento),
    cliente: { id: f.cliente_id, nombre: f.cliente_nombre, identificacion: f.cliente_identificacion },
    observaciones: f.observaciones || '', total: numero(f.total), electronica: Boolean(f.electronica),
    // La fila SQL tiene un saldo histórico, no el calculado. No se usa como
    // deuda. El listado y el detalle propios traen el saldo de consulta.
    lineas: Array.isArray(f.lineas) ? f.lineas.map(l => ({
      productoId: l.producto_id, nombre: l.nombre, referencia: l.referencia,
      descripcion: l.descripcion || '', cantidad: numero(l.cantidad), precioUnitario: numero(l.precio_unitario),
      descuentoPorcentaje: numero(l.descuento_porcentaje), impuestoId: l.impuesto_id,
      tarifa: numero(l.tarifa), total: numero(l.total)
    })) : null,
    esPropia: true, yaExistia: Boolean(f.yaExistia)
  }
}

export function facturaConsultada(f) {
  return f ? { ...f, fecha: dia(f.fecha), fechaVencimiento: dia(f.fechaVencimiento), esPropia: true } : f
}

/** Solo al subir IndexedDB de v3 a v4. Los envíos pendientes no se cambian. */
export function convertirCopiaV3(f, pendiente = null) {
  if (!f) return f
  if (!f.numberTemplate && !f.items && !f.client) return f
  const local = String(f.id).startsWith('local-')
  const items = Array.isArray(f.items) ? f.items : []
  // Los borradores locales de v3 no siempre guardaban la marca. Solo se
  // reconoce el contrato propio si la cola tiene ids propios EXPLÍCITOS y
  // cada línea de la fotografía coincide; nunca adivinar con el id de Alegra.
  const colaPropia = local && pendiente?.clienteId && items.length > 0 &&
    pendiente.items?.length === items.length && items.every((l, i) =>
      pendiente.items[i].productoId && String(l.productoId ?? l.id) === String(pendiente.items[i].productoId))
  const esPropia = Boolean(f.esPropia || colaPropia)
  const clienteAnterior = f.client || f.cliente || {}
  const clienteId = esPropia ? (colaPropia ? pendiente.clienteId : clienteAnterior.id) : null
  const id = esPropia || local ? String(f.id) : `copia-alegra-${f.id}`
  return {
    ...Object.fromEntries(Object.entries(f).filter(([k]) => !['numberTemplate', 'client', 'items', 'date', 'dueDate', 'status', 'observations', 'discount'].includes(k))),
    id, esPropia,
    ...(!esPropia && !local ? { alegraId: f.id } : {}),
    numero: f.numberTemplate?.fullNumber || f.numeroTemporal || String(f.id),
    fecha: dia(f.date), fechaVencimiento: dia(f.dueDate),
    estado: local ? 'borrador' : f.status === 'void' ? 'anulada' : 'emitida',
    cliente: { id: clienteId, nombre: clienteAnterior.name || clienteAnterior.nombre || '',
      identificacion: clienteAnterior.identification || clienteAnterior.identificacion || '',
      ...(!esPropia ? { alegraId: clienteAnterior.id } : {}) },
    observaciones: f.observations || f.observaciones || '',
    descuentoGlobal: numero(f.discount),
    lineas: items.map((l, i) => ({
      productoId: esPropia ? (l.productoId ?? (colaPropia ? pendiente.items[i].productoId : null)) : null,
      ...(!esPropia ? { alegraItemId: l.id } : {}),
      nombre: l.name, referencia: l.reference, descripcion: l.description || '',
      cantidad: numero(l.quantity), precioUnitario: numero(l.price), descuentoPorcentaje: numero(l.discount),
      impuestoId: l.tax?.[0]?.id, tarifa: numero(l.tax?.[0]?.percentage),
      // Algunas copias resumidas ya no tenían líneas. No convertir una lista
      // sin detalle en una factura vacía que después se guarde sobre la real.
    })),
    detalleDisponible: items.length > 0
  }
}

/** Una precarga resumida no borra el detalle ya descargado para usar sin red. */
export function combinarCopiaFactura(anterior, nueva) {
  nueva = Object.fromEntries(Object.entries(nueva).filter(([, v]) => v !== undefined))
  const completa = Array.isArray(nueva.lineas)
  return { ...anterior, ...nueva, id: String(nueva.id),
    lineas: completa ? nueva.lineas : (anterior?.lineas ?? nueva.lineas),
    detalleDisponible: completa ? nueva.lineas.length > 0 : Boolean(anterior?.detalleDisponible || Array.isArray(anterior?.lineas)) }
}
