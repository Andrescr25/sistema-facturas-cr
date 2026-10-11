import api from './api'

/** Descarga autenticada. Un error JSON nunca se guarda con extensión .xlsx. */
export async function descargarExcel(ruta, params = {}) {
  let response
  try {
    response = await api.get(ruta, { params, responseType: 'blob' })
  } catch (error) {
    const cuerpo = error.response?.data
    if (cuerpo instanceof Blob) {
      try {
        const datos = JSON.parse(await cuerpo.text())
        throw new Error(datos.message || datos.error || 'No se pudo descargar el Excel.')
      } catch (lectura) {
        if (!(lectura instanceof SyntaxError)) throw lectura
      }
    }
    throw new Error('No se pudo descargar el Excel. Intenta de nuevo.')
  }
  if (!response.headers['content-type']?.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
    throw new Error('El servidor no devolvió un archivo Excel.')
  }
  const nombre = response.headers['content-disposition']?.match(/filename="([^"]+)"/)?.[1] || 'reporte.xlsx'
  const url = URL.createObjectURL(response.data)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  // Dejar que el navegador empiece a leer el blob antes de retirar su URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
