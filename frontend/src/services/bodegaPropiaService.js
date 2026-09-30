import api from './api'

/**
 * Facturas en Bodega sobre la factura PROPIA (rama independencia-alegra,
 * sección 11 del checklist). Todo va por `facturaId`, el id propio: las rutas
 * de Alegra (`/alegra/bodega/facturas/:alegraId`) siguen en alegraService para
 * lo que todavía llega por ahí, con otro nombre a propósito.
 */
export const bodegaPropiaService = {
  async listar({ dias, limit } = {}) {
    const { data } = await api.get('/alegra/bodega/facturas-propias', { params: { dias, limit } })
    return data
  },

  async estados(facturaId) {
    const { data } = await api.get(`/alegra/bodega/facturas-propias/${facturaId}/estados`)
    return data.data
  },

  async registrarFaltantes(facturaId, faltantes, registradoPor = 'Bodega') {
    const { data } = await api.post(`/alegra/bodega/facturas-propias/${facturaId}/faltantes`, { faltantes, registrado_por: registradoPor })
    return data
  },

  async actualizarEstado(facturaId, estado, observaciones = null, enviarAImpresion = false) {
    const { data } = await api.post(`/alegra/bodega/facturas-propias/${facturaId}/estado`, {
      estado, observaciones, enviar_a_impresion: enviarAImpresion
    })
    return data
  }
}
