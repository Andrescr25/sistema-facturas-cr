import api from './api'

/**
 * Maestro de productos propio (rama independencia-alegra).
 * Reemplaza las llamadas a /alegra/catalog, que escribían en Alegra.
 */
export const productosService = {
  async listar(filtros) {
    const { data } = await api.get('/maestro/productos', { params: filtros })
    return { productos: data.data, paginacion: data.paginacion }
  },

  /** La ficha completa (CABYS, impuesto, unidad, medicamento…): la fila de la lista no la trae. */
  async obtener(id) {
    const { data } = await api.get(`/maestro/productos/${id}`)
    return data.data
  },

  async proveedores() {
    const { data } = await api.get('/maestro/productos/proveedores')
    return data.data
  },

  async crear(valores) {
    const { data } = await api.post('/maestro/productos', valores)
    return data.data
  },

  async editar(id, cambios) {
    const { data } = await api.put(`/maestro/productos/${id}`, cambios)
    return data.data
  },

  async cambiarEstado(id, cambios) {
    const { data } = await api.patch(`/maestro/productos/${id}/estado`, cambios)
    return data.data
  },

  async imagenDesdeUrl(id, url, urlRespaldo) {
    const { data } = await api.post(`/maestro/productos/${id}/imagen/url`, { url, urlRespaldo })
    return data.data
  },

  async imagenDesdeArchivo(id, archivo) {
    const formulario = new FormData()
    formulario.append('imagen', archivo)
    const { data } = await api.post(`/maestro/productos/${id}/imagen/archivo`, formulario, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return data.data
  },

  async categorias() {
    const { data } = await api.get('/maestro/categorias')
    return data.data
  },

  async crearCategoria(nombre) {
    const { data } = await api.post('/maestro/categorias', { nombre })
    return data.data
  },

  async editarCategoria(id, nombre) {
    const { data } = await api.put(`/maestro/categorias/${id}`, { nombre })
    return data.data
  },

  async cambiarActivoCategoria(id, activo) {
    const { data } = await api.patch(`/maestro/categorias/${id}/activo`, { activo })
    return data.data
  },

  /** Los impuestos activos, de la configuración propia. */
  async impuestos() {
    const { data } = await api.get('/catalogos/configuracion')
    return data.data.impuestos
  }
}
