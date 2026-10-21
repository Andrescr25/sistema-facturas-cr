import api from './api'

/** Descarga autenticada: el JSON de un error no se guarda como si fuera un archivo. */
export async function descargarArchivo(ruta, { tipo, nombre, params = {} }) {
  let response
  try {
    response = await api.get(ruta, { params, responseType: 'blob' })
  } catch (error) {
    const cuerpo = error.response?.data
    if (cuerpo instanceof Blob) {
      try {
        const datos = JSON.parse(await cuerpo.text())
        throw new Error(datos.message || datos.error || 'No se pudo descargar el archivo.')
      } catch (lectura) {
        if (!(lectura instanceof SyntaxError)) throw lectura
      }
    }
    throw new Error('No se pudo descargar el archivo. Intentá de nuevo.')
  }
  if (tipo && !response.headers['content-type']?.includes(tipo)) throw new Error('El servidor no devolvió el archivo esperado.')
  const destino = response.headers['content-disposition']?.match(/filename="([^"]+)"/)?.[1] || nombre
  const url = URL.createObjectURL(response.data)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = destino
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
