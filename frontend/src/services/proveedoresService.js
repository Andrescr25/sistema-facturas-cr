import api from './api'

/**
 * Fichas de proveedores (rama independencia-alegra).
 *
 * Viven bajo /proveedores/fichas, al lado del reporte de compras que ya
 * existía en ese mismo prefijo. Antes "proveedor" era tres listas distintas
 * —el mapeo por cédula, una tabla vieja sin cédula y los contactos de
 * Alegra— y ninguna se podía corregir desde el sistema.
 */
export const proveedoresService = {
  async listar(filtros) {
    const { data } = await api.get('/proveedores/fichas', { params: filtros })
    return { proveedores: data.data, paginacion: data.paginacion }
  },

  /** La ficha con sus últimas compras y los productos que le compramos. */
  async obtener(id) {
    const { data } = await api.get(`/proveedores/fichas/${id}`)
    return data.data
  },

  async crear(valores) {
    const { data } = await api.post('/proveedores/fichas', valores)
    return data.data
  },

  async editar(id, cambios) {
    const { data } = await api.put(`/proveedores/fichas/${id}`, cambios)
    return data.data
  },

  async cambiarEstado(id, activo) {
    const { data } = await api.patch(`/proveedores/fichas/${id}/estado`, { activo })
    return data.data
  },

  /** Los plazos de crédito, de la configuración propia (ruta compartida). */
  async plazos() {
    const { data } = await api.get('/catalogos/configuracion')
    return data.data.plazos
  }
}
