import api from './api'
const base = '/clientes/rutas'
const dato = async peticion => (await peticion).data.data
export const rutasService = {
  listar: () => dato(api.get(base)),
  obtener: id => dato(api.get(`${base}/${id}`)),
  crear: datos => dato(api.post(base, datos)),
  editar: (id, datos) => dato(api.put(`${base}/${id}`, datos)),
  ordenar: (id, clienteIds, version) => dato(api.put(`${base}/${id}/orden`, { clienteIds, version })),
  ciclos: () => dato(api.get(`${base}/ciclos`)),
  ciclo: id => dato(api.get(`${base}/ciclos/${id}`)),
  crearCiclo: (id, semana) => dato(api.post(`${base}/${id}/ciclos`, { semana })),
  estadoCiclo: (ciclo, estado) => dato(api.patch(`${base}/ciclos/${ciclo.id}/estado`, { estado, estadoAnterior: ciclo.estado }))
}
