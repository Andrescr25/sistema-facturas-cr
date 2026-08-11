import api from './api'

export async function getPagosProveedores(params = {}) {
  const response = await api.get('/pagos-proveedores', { params })
  return response.data
}

export async function actualizarPagoProveedor(id, payload) {
  const response = await api.patch(`/pagos-proveedores/${id}`, payload)
  return response.data
}

export async function getProveedoresConCuentas() {
  const response = await api.get('/pagos-proveedores/proveedores')
  return response.data
}

// --- Notas de crédito ---
// Saldo a favor = crédito de un proveedor que todavía no se pudo descontar
// (su factura ya estaba pagada, o sobró). Es plata que te deben.

export async function getSaldosAFavor() {
  const response = await api.get('/pagos-proveedores/notas-credito/saldos-a-favor')
  return response.data
}

export async function getCandidatasNota(notaId) {
  const response = await api.get(`/pagos-proveedores/notas-credito/${notaId}/candidatas`)
  return response.data
}

export async function aplicarNotaACuenta(notaId, cuentaId, monto) {
  const response = await api.post(
    `/pagos-proveedores/notas-credito/${notaId}/aplicar-a/${cuentaId}`,
    monto !== undefined ? { monto } : {}
  )
  return response.data
}

export async function eliminarNotaCredito(notaId) {
  const response = await api.delete(`/pagos-proveedores/notas-credito/${notaId}`)
  return response.data
}

