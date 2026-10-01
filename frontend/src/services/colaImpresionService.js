import api from './api'

/**
 * La cola de impresión sobre la factura PROPIA (rama independencia-alegra,
 * sección 11 del checklist). Todo va por `facturaId`, el id propio
 * (`factura.id`): las rutas viejas por id de Alegra
 * (`/alegra/facturas/procesar-individual`, `/alegra/facturas/:id/recuperar`)
 * siguen en alegraService con otro nombre a propósito.
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
  }
}
