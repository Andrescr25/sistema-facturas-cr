import api from './api'

/**
 * Facturas en Bodega sobre la factura PROPIA (rama independencia-alegra,
 * sección 11 del checklist). Todo va por `facturaId`, el id propio. Las rutas
 * por id de Alegra (`/alegra/bodega/facturas/:alegraId`) se retiraron el
 * 2026-09-30.
 */
export const bodegaPropiaService = {
  async listar({ dias, limit, rutaId } = {}) {
    const { data } = await api.get('/bodega/facturas-propias', { params: { dias, limit, rutaId } })
    return data
  },

  async estados(facturaId) {
    const { data } = await api.get(`/bodega/facturas-propias/${facturaId}/estados`)
    return data.data
  },

  /** Alguien abrió la factura: desde ahora Facturación ya no la edita. */
  async tomar(facturaId) {
    const { data } = await api.post(`/bodega/facturas-propias/${facturaId}/tomar`)
    return data
  },

  async registrarFaltantes(facturaId, faltantes, registradoPor = 'Bodega') {
    const { data } = await api.post(`/bodega/facturas-propias/${facturaId}/faltantes`, { faltantes, registrado_por: registradoPor })
    return data
  },

  async actualizarEstado(facturaId, estado, observaciones = null, enviarAImpresion = false) {
    const { data } = await api.post(`/bodega/facturas-propias/${facturaId}/estado`, {
      estado, observaciones, enviar_a_impresion: enviarAImpresion
    })
    return data
  }
}
