import { normalizarBusqueda } from './reporteClientesUtils.js'

export const SECCIONES_PREVENTA = [
  { estado: 'atrasado', titulo: 'Atrasados', tono: 'peligro' },
  { estado: 'hoy', titulo: 'Hoy', tono: 'alerta' },
  { estado: 'proximo', titulo: 'Próximos', tono: 'exito' },
  { estado: 'sin_rotacion', titulo: 'Sin rotación', tono: 'neutro' },
  { estado: 'sin_facturas', titulo: 'Sin facturas', tono: 'neutro' }
]

/** Conserva el orden por visita del servidor y la identidad por id.
 * La búsqueda no borra fichas ni inventa una fecha para las incompletas.
 */
export function agruparAgenda(clientes, { buscar = '', estado = 'todos' } = {}) {
  const palabras = normalizarBusqueda(buscar).split(/\s+/).filter(Boolean)
  return SECCIONES_PREVENTA.filter(s => estado === 'todos' || estado === s.estado).map(s => ({
    ...s,
    clientes: clientes.filter(c => {
      if (c.rotacion?.estado !== s.estado) return false
      const texto = normalizarBusqueda(c.nombre)
      return palabras.every(p => texto.includes(p))
    })
  }))
}

export function contarAgenda(clientes) {
  return Object.fromEntries(SECCIONES_PREVENTA.map(s => [s.estado,
    clientes.filter(c => c.rotacion?.estado === s.estado).length]))
}
