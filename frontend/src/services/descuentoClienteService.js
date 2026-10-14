import api, { TOKEN_KEY } from './api'
import indexedDBService from './indexedDBService'

function clave(clienteId) {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const usuario = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return `descuento-cliente.${usuario.id ?? usuario.sub}.${clienteId}`
  } catch { return null }
}

export async function consultarDescuentoCliente(cliente, online) {
  const id = Number(cliente.clienteId ?? cliente.id)
  const key = clave(id)
  if (online) {
    const { data } = await api.get(`/facturacion/clientes/${id}/descuento`)
    if (key) await indexedDBService.setConfig(key, data.data)
    return data.data
  }
  const guardado = key ? await indexedDBService.getConfig(key) : null
  if (guardado) return guardado
  if (cliente.descuentoGlobal === 0) return { clienteId: id, porcentaje: 0, costos: [] }
  throw new Error('Conectate una vez para descargar el descuento y los márgenes de este cliente.')
}
