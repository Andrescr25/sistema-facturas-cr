import api from './api'

export async function getResumenRentabilidad() {
  const response = await api.get('/rentabilidad/resumen')
  return response.data
}

export async function getProductosRentabilidad(params = {}) {
  const response = await api.get('/rentabilidad/productos', { params })
  return response.data
}

// ==================== Competencia (Fase 3) ====================

export async function getPendientesCompetencia() {
  const response = await api.get('/rentabilidad/competencia/pendientes')
  return response.data
}

export async function getConfirmadosCompetencia() {
  const response = await api.get('/rentabilidad/competencia/confirmados')
  return response.data
}

export async function confirmarMatchCompetencia(payload) {
  const response = await api.post('/rentabilidad/competencia/confirmar', payload)
  return response.data
}

export async function rechazarMatchCompetencia(payload) {
  const response = await api.post('/rentabilidad/competencia/rechazar', payload)
  return response.data
}

export async function importarManualCompetencia(payload) {
  const response = await api.post('/rentabilidad/competencia/importar-manual', payload)
  return response.data
}

export async function sincronizarCompetencia(payload) {
  const response = await api.post('/rentabilidad/competencia/sincronizar', payload)
  return response.data
}
