import api from './api'

export async function getPagosProveedores(params = {}) {
  const response = await api.get('/pagos-proveedores', { params })
  return response.data
}

export async function actualizarPagoProveedor(id, payload) {
  const response = await api.patch(`/pagos-proveedores/${id}`, payload)
  return response.data
}

