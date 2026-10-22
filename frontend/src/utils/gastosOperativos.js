export const TRATAMIENTOS_FACTURA = [
  { valor: 'comercial', texto: 'Comercial · productos para vender' },
  { valor: 'combustible', texto: 'Combustible' },
  { valor: 'alimentacion', texto: 'Alimentación y viáticos' },
  { valor: 'mixto', texto: 'Mixto · elegir en cada factura' }
]
export const CATEGORIAS_GASTO = TRATAMIENTOS_FACTURA.filter(t => ['combustible', 'alimentacion'].includes(t.valor))
export const RESPUESTAS_GASTO = [
  { valor: '1', texto: 'Aceptar totalmente' },
  { valor: '2', texto: 'Aceptar parcialmente' },
  { valor: '3', texto: 'Rechazar' }
]

export function categoriaGasto(valor) {
  return CATEGORIAS_GASTO.find(c => c.valor === valor)?.texto || 'Gasto operativo'
}

export function camposGeneralesGasto(g) {
  return { categoria: g.categoria, descripcion: g.descripcion || '', empleado: g.empleado || '', placa: g.placa || '' }
}

export function camposFiscalesGasto(g) {
  return { renta: g.renta, iva: g.iva, iva_credito: String(g.iva_credito || 0),
    gasto_deducible: String(g.gasto_deducible || 0), respuesta: g.respuesta || '', motivo_fiscal: g.motivo_fiscal || '' }
}

/** Saldo y pago vienen de CxP: no se deducen del medio de pago escrito en el XML. */
export function pagoDelGasto(g) {
  if (g.decision === 'rechazado') return { texto: 'Rechazado', tono: 'peligro' }
  if (!g.compra_id) return { texto: 'Revisar comprobante', tono: 'alerta' }
  if (Number(g.saldo) <= 0) return { texto: 'Sin saldo pendiente', tono: 'exito' }
  return { texto: g.estado_pago === 'PARCIAL' || Number(g.pagado) > 0 ? 'Pago parcial' : 'Pendiente de pago', tono: 'neutro' }
}

export function resumenFiscalGasto(g) {
  if (!g.revisado_en) return 'Tratamiento tributario por revisar'
  return RESPUESTAS_GASTO.find(r => r.valor === g.respuesta)?.texto || 'Revisado'
}

export function estadoFiscalGasto(g, estado = g.estado_hacienda) {
  if (estado === 'aceptada') return { texto: g.decision === 'rechazado' ? 'Rechazo recibido por Hacienda' : 'Aceptada en Hacienda', tono: 'exito' }
  if (estado === 'rechazada') return { texto: 'Respuesta rechazada por Hacienda', tono: 'peligro' }
  if (['recibida', 'procesando', 'enviando', 'preparada', 'incierta'].includes(estado)) return { texto: 'Respuesta en proceso', tono: 'nota' }
  return { texto: 'Respuesta pendiente', tono: 'alerta' }
}

export function camposCambiadosGasto(cambios) {
  const nombres = { categoria: 'Categoría', descripcion: 'Descripción', empleado: 'Empleado', placa: 'Vehículo',
    renta: 'Deducción para renta', gasto_deducible: 'Gasto deducible', iva: 'Tratamiento de IVA',
    iva_credito: 'Crédito de IVA', respuesta: 'Respuesta al comprobante', motivo_fiscal: 'Justificación' }
  return Object.keys(cambios || {}).map(k => nombres[k]).filter(Boolean).join(', ')
}
