import api from './api'

export async function getResumenFlujo() {
  const response = await api.get('/pagos-recurrentes/resumen')
  return response.data
}

export async function getGastos() {
  const response = await api.get('/pagos-recurrentes/gastos')
  return response.data
}

export async function crearGasto(payload) {
  const response = await api.post('/pagos-recurrentes/gastos', payload)
  return response.data
}

export async function actualizarGasto(id, payload) {
  const response = await api.put(`/pagos-recurrentes/gastos/${id}`, payload)
  return response.data
}

export async function cambiarActivoGasto(id, activo) {
  const response = await api.patch(`/pagos-recurrentes/gastos/${id}/activo`, { activo })
  return response.data
}

export async function eliminarGasto(id) {
  const response = await api.delete(`/pagos-recurrentes/gastos/${id}`)
  return response.data
}

export async function getHistorialGasto(id) {
  const response = await api.get(`/pagos-recurrentes/gastos/${id}/historial`)
  return response.data
}

export async function getPeriodo(periodo) {
  const response = await api.get(`/pagos-recurrentes/periodo/${periodo}`)
  return response.data
}

export async function marcarPagado(id, payload) {
  const response = await api.post(`/pagos-recurrentes/pagos/${id}/pagar`, payload)
  return response.data
}

export async function revertirPago(id) {
  const response = await api.post(`/pagos-recurrentes/pagos/${id}/revertir`)
  return response.data
}

export async function actualizarPago(id, payload) {
  const response = await api.patch(`/pagos-recurrentes/pagos/${id}`, payload)
  return response.data
}

// --- Consulta automática de recibos ---
// Cada llamada golpea el sitio del proveedor (ASP.NET con 4 postbacks
// encadenados), así que son lentas comparadas con el resto de la API.

export async function getFuentesAuto() {
  const response = await api.get('/pagos-recurrentes/fuentes')
  return response.data
}

export async function getOpcionesFuente(fuente, params = {}) {
  const response = await api.get(`/pagos-recurrentes/fuentes/${fuente}/opciones`, { params })
  return response.data
}

export async function sincronizarGasto(id) {
  const response = await api.post(`/pagos-recurrentes/gastos/${id}/sincronizar`)
  return response.data
}

export async function sincronizarTodos() {
  const response = await api.post('/pagos-recurrentes/sincronizar')
  return response.data
}
