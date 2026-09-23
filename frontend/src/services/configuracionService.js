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

/**
 * De dónde puede salir un pago (cuentas de dinero) y cómo (métodos), del
 * catálogo propio. Solo lo activo. La usan Pagos a Proveedores y Pagos
 * Recurrentes: los dos registran plata que sale de una cuenta.
 */
export async function getOpcionesPago() {
  const response = await api.get('/catalogos/configuracion')
  const datos = response.data?.data ?? response.data ?? {}
  return {
    cuentas: (datos.cuentas ?? []).map((c) => ({ id: c.id, nombre: c.nombre, tipo: c.tipo })),
    metodos: (datos.metodosPago ?? []).map((m) => ({
      id: m.id, clave: m.clave, nombre: m.nombre, pideReferencia: m.pide_referencia
    }))
  }
}
