import api from './api'

export async function getCuentasPorCobrar(params = {}) {
  const response = await api.get('/cuentas-por-cobrar', { params })
  return response.data
}

export async function getAbonosFactura(alegraInvoiceId) {
  const response = await api.get(`/cuentas-por-cobrar/facturas/${alegraInvoiceId}/abonos`)
  return response.data
}

export async function registrarAbono(payload) {
  const response = await api.post('/cuentas-por-cobrar/abonos', payload)
  return response.data
}

export async function sincronizarCuentasPorCobrar() {
  const response = await api.post('/cuentas-por-cobrar/sync')
  return response.data
}
