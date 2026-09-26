import api from './api'

/** Rentabilidad: el resumen del negocio, la lista de productos y el detalle de uno. */

export async function getResumenRentabilidad() {
  const { data } = await api.get('/rentabilidad/resumen')
  return data.data
}

export async function getProductosRentabilidad(params = {}) {
  const { data } = await api.get('/rentabilidad/productos', { params })
  return data.data
}

export async function getProductoRentabilidad(alegraItemId) {
  const { data } = await api.get(`/rentabilidad/productos/${alegraItemId}`)
  return data.data
}
