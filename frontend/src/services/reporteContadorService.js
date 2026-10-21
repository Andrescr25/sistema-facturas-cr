import api from './api'
export const leerMesContador = async (params) =>
  (await api.get('/reporte-contador/mes', { params })).data.data
export const leerArchivosContador = async (params) =>
  (await api.get('/reporte-contador/periodos', { params })).data.data
export const leerContactosContador = async () =>
  (await api.get('/reporte-contador/contactos')).data.data
export const guardarContactoContador = async (datos) =>
  (await api.post('/reporte-contador/contactos', datos)).data.data
export const eliminarContactoContador = (id) => api.delete(`/reporte-contador/contactos/${id}`)
export const enviarMesContador = async (datos) =>
  (await api.post('/reporte-contador/enviar-contador', datos)).data.data
