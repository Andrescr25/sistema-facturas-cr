import api from './api'
import { abrirPdfFacturaPropia } from './facturaPropiaAdaptador'

/**
 * La cola de impresión sobre la factura PROPIA (rama independencia-alegra,
 * sección 11 del checklist). Todo va por `facturaId`, el id propio
 * (`factura.id`). Las rutas viejas por id de Alegra
 * (`/alegra/facturas/procesar-individual`, `/alegra/facturas/:id/recuperar`)
 * se retiraron el 2026-09-30.
 */

/** El mensaje que mandó el servidor, no el "Request failed with status code 409" de axios. */
async function pedir(promesa) {
  try {
    const { data } = await promesa
    return data
  } catch (error) {
    throw new Error(error.response?.data?.message || error.message)
  }
}

export const colaImpresionService = {
  /** Reporte de Clientes: la factura está lista → a Impresión, con lo que llegó. */
  enviarDesdeReporte(facturaId) {
    return pedir(api.post(`/reportes/faltantes/cliente/facturas/${facturaId}/impresion`))
  },

  /** Reporte de Clientes: recuperarla para volver a revisarla. */
  recuperarDesdeReporte(facturaId) {
    return pedir(api.post(`/reportes/faltantes/cliente/facturas/${facturaId}/recuperar`))
  },

  // ─── Impresión (todo bajo /reimpresion, que es de ese módulo) ───

  pendientes() {
    return pedir(api.get('/reimpresion/facturas/pendientes'))
  },

  procesadas() {
    return pedir(api.get('/reimpresion/facturas/procesadas'))
  },

  /** La factura con las líneas ya propuestas: faltantes rebajados y precios del catálogo. */
  async detalle(facturaId) {
    return (await pedir(api.get(`/reimpresion/facturas/${facturaId}`))).data
  },

  /** Sin `lineas` aplica la propuesta tal cual; con `lineas`, las que dejó la persona. */
  procesar(facturaId, { lineas = null, actualizarPrecios = true } = {}) {
    return pedir(api.post(`/reimpresion/facturas/${facturaId}/procesar`, { lineas, actualizarPrecios }))
  },

  recuperarProcesada(facturaId) {
    return pedir(api.post(`/reimpresion/facturas/${facturaId}/recuperar`))
  },

  async buscarProductos(texto) {
    return (await pedir(api.get('/reimpresion/productos', { params: { q: texto } }))).data || []
  },

  abrirPdf(facturaId, ventana = null) {
    return abrirPdfFacturaPropia(api, facturaId, { ruta: `/reimpresion/facturas/${facturaId}/pdf`, ventana })
  }
}
