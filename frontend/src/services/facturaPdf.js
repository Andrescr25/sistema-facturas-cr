/**
 * Abre el PDF propio detrás de la sesión. Impresión puede pedir su ruta
 * bajo /reimpresion: tener ese módulo no concede permiso a /facturacion.
 */
export async function abrirPdfFacturaPropia(api, facturaId, { ruta, ventana: abierta = null } = {}) {
  // Abrir antes del await evita que el navegador bloquee la pestaña.
  const ventana = abierta || window.open('', '_blank')
  try {
    const { data } = await api.get(ruta || `/facturacion/facturas/${facturaId}/pdf`, { responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
    if (ventana) ventana.location = url
    else window.location.href = url
    setTimeout(() => URL.revokeObjectURL(url), 60000)
    return { success: true }
  } catch (error) {
    ventana?.close()
    throw error
  }
}
