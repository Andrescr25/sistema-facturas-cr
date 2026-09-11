import api from './api'

/**
 * Configuración de la empresa (rama independencia-alegra).
 *
 * Lo que antes vivía en Alegra —impuestos, plazos, cuentas— o solo en el
 * navegador —los datos de la empresa se guardaban en localStorage y nada los
 * leía— ahora sale de la base propia.
 */
export const configuracionService = {
  async obtener() {
    const { data } = await api.get('/configuracion')
    return data.data
  },

  async actualizarEmpresa(cambios) {
    const { data } = await api.put('/configuracion/empresa', cambios)
    return data.data
  },

  async crear(catalogo, valores) {
    const { data } = await api.post(`/configuracion/${catalogo}`, valores)
    return data.data
  },

  async editar(catalogo, id, valores) {
    const { data } = await api.put(`/configuracion/${catalogo}/${id}`, valores)
    return data.data
  },

  async cambiarActivo(catalogo, id, activo) {
    const { data } = await api.patch(`/configuracion/${catalogo}/${id}/activo`, { activo })
    return data.data
  }
}

/**
 * El mensaje del servidor dice qué hay que corregir ("una CF tiene 9
 * dígitos", "ya existe un plazo con esos días"): vale más que uno genérico.
 */
export function mensajeDeError(error, porDefecto) {
  return error?.response?.data?.message || error?.response?.data?.error || porDefecto
}
