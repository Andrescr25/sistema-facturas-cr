import api from './api'

export async function listarPeriodos(anio, mes) {
  const response = await api.get('/reporte-contador/periodos', { params: { anio, mes } })
  return response.data
}

export async function cargarPeriodo({ archivo, tipo, anio, mes }) {
  const formData = new FormData()
  formData.append('archivo', archivo)
  formData.append('tipo', tipo)
  formData.append('anio', anio)
  formData.append('mes', mes)

  const response = await api.post('/reporte-contador/periodos', formData, {
    // Sin content-type explícito el axios global fuerza 'application/json'
    // (ver services/api.js) y el multipart nunca llega con el boundary
    // correcto. 'multipart/form-data' a secas alcanza: el navegador le
    // agrega el boundary solo cuando el body es un FormData real.
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000
  })
  return response.data
}

/**
 * Trae el mes directo de la API de Alegra, sin Excel. Puede tardar: recorre
 * todas las facturas del mes paginando de 30 en 30.
 */
export async function importarDesdeAlegra({ tipo, anio, mes }) {
  const response = await api.post('/reporte-contador/periodos/importar-alegra', { tipo, anio, mes }, { timeout: 180000 })
  return response.data
}

export async function obtenerPeriodo(id) {
  const response = await api.get(`/reporte-contador/periodos/${id}`)
  return response.data
}

export async function eliminarPeriodo(id) {
  const response = await api.delete(`/reporte-contador/periodos/${id}`)
  return response.data
}

export async function toggleExcluirFactura(periodoId, numero, excluido) {
  const response = await api.patch(`/reporte-contador/periodos/${periodoId}/facturas/${numero}`, { excluido })
  return response.data
}

export async function actualizarLinea(lineaId, campos) {
  const response = await api.patch(`/reporte-contador/lineas/${lineaId}`, campos)
  return response.data
}

export async function eliminarLinea(lineaId) {
  const response = await api.delete(`/reporte-contador/lineas/${lineaId}`)
  return response.data
}

export async function redetectarDuplicados(periodoId) {
  const response = await api.post(`/reporte-contador/periodos/${periodoId}/redetectar-duplicados`)
  return response.data
}

/** Dispara la descarga del Excel corregido directo desde el navegador. */
export async function descargarExportado(periodoId, nombreSugerido) {
  const response = await api.get(`/reporte-contador/periodos/${periodoId}/exportar`, { responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  link.download = nombreSugerido || 'reporte.xlsx'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

/** Contactos guardados a los que se les puede mandar el reporte. */
export async function listarContactos() {
  const response = await api.get('/reporte-contador/contactos')
  return response.data
}

export async function crearContacto({ nombre, email }) {
  const response = await api.post('/reporte-contador/contactos', { nombre, email })
  return response.data
}

export async function eliminarContacto(id) {
  const response = await api.delete(`/reporte-contador/contactos/${id}`)
  return response.data
}

/** Envía los reportes del mes (ventas y compras) ya revisados. */
export async function enviarAlContador({ anio, mes, contactoId }) {
  const response = await api.post('/reporte-contador/enviar-contador', { anio, mes, contactoId })
  return response.data
}
