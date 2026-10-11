import api from './api'
const base = '/clientes/rutas'
const dato = async peticion => (await peticion).data.data
export const rutasService = {
  listar: () => dato(api.get(base)),
  obtener: id => dato(api.get(`${base}/${id}`)),
  crear: datos => dato(api.post(base, datos)),
  editar: (id, datos) => dato(api.put(`${base}/${id}`, datos)),
  ordenar: (id, clienteIds, version) => dato(api.put(`${base}/${id}/orden`, { clienteIds, version })),
  // Todos los clientes con su ruta de hoy, y guardar de una vez quiénes entran y quiénes salen.
  candidatos: id => dato(api.get(`${base}/${id}/asignacion`)),
  asignar: (id, cambios) => dato(api.put(`${base}/${id}/clientes`, cambios)),
  ciclos: () => dato(api.get(`${base}/ciclos`)),
  ciclo: id => dato(api.get(`${base}/ciclos/${id}`)),
  crearCiclo: (id, semana) => dato(api.post(`${base}/${id}/ciclos`, { semana })),
  estadoCiclo: (ciclo, estado) => dato(api.patch(`${base}/ciclos/${ciclo.id}/estado`, { estado, estadoAnterior: ciclo.estado }))
}
