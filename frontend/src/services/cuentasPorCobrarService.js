import api from './api'

export async function getCuentasPorCobrar(params = {}) {
  const response = await api.get('/cuentas-por-cobrar', { params })
  return response.data
}

export async function getAbonosFactura(alegraInvoiceId) {
  const response = await api.get(`/cuentas-por-cobrar/facturas/${alegraInvoiceId}/abonos`)
  return response.data
}

/** Las líneas de una factura. Se piden a Alegra al abrir el detalle. */
export async function getProductosFactura(alegraInvoiceId) {
  const response = await api.get(`/cuentas-por-cobrar/facturas/${alegraInvoiceId}/productos`)
  return response.data
}

export async function registrarAbono(payload) {
  const response = await api.post('/cuentas-por-cobrar/abonos', payload)
  return response.data
}

export async function getCobrosDia(fecha) {
  const response = await api.get('/cuentas-por-cobrar/cobros-dia', { params: { fecha } })
  return response.data
}

export async function sincronizarCuentasPorCobrar() {
  const response = await api.post('/cuentas-por-cobrar/sync')
  return response.data
}
