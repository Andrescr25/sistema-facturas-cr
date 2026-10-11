import api from './api'

/**
 * Maestro de clientes propio (rama independencia-alegra).
 *
 * Hasta ahora la pantalla de Clientes solo manejaba el portal y las fichas
 * vivían en Alegra, sin forma de crearlas ni corregirlas desde el sistema.
 */
export const clientesService = {
  async listar(filtros) {
    const { data } = await api.get('/clientes', { params: filtros })
    return { clientes: data.data, paginacion: data.paginacion }
  },

  async obtener(id) {
    const { data } = await api.get(`/clientes/${id}`)
    return data.data
  },

  async crear(valores) {
    const { data } = await api.post('/clientes', valores)
    return data.data
  },

  async editar(id, cambios) {
    const { data } = await api.put(`/clientes/${id}`, cambios)
    return data.data
  },

  async cambiarEstado(id, activo) {
    const { data } = await api.patch(`/clientes/${id}/estado`, { activo })
    return data.data
  },

  /** Todo lo del cliente: saldo, facturas, abonos, qué compra y sus pedidos. */
  async resumen(id) {
    const { data } = await api.get(`/clientes/${id}/resumen`)
    return data.data
  },

  /**
   * Con qué otras fichas choca una identificación. Avisa, no bloquea: el
   * número del cliente de mostrador lo comparten 139 fichas a propósito.
   */
  async coincidencias(identificacion, excepto) {
    const { data } = await api.get('/clientes/coincidencias', { params: { identificacion, excepto } })
    return data.data
  },

  /**
   * Quién es esa cédula, según la consulta pública de Hacienda. Lo que llega
   * se propone; no pisa lo que la persona escribió.
   */
  async hacienda(identificacion) {
    const { data } = await api.get(`/clientes/hacienda/${encodeURIComponent(identificacion)}`)
    return data.data
  },

  /** Los plazos de crédito activos, de la configuración propia. */
  async plazos() {
    const { data } = await api.get('/catalogos/configuracion')
    return data.data.plazos
  }
}
