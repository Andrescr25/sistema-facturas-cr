import api from '../services/api'

/**
 * La dirección para mostrar un archivo guardado por el sistema.
 *
 * Las fotos propias se guardan como ruta ("/archivos/productos/7-….jpg") y
 * las sirve el backend. En desarrollo el frontend y el backend corren en
 * puertos distintos, así que la ruta se completa con el origen de la API.
 * Una URL completa (las fotos que todavía vienen de Alegra) se deja igual.
 */
export function urlArchivo(ruta) {
  if (!ruta) return null
  if (/^(https?:|data:|blob:)/i.test(ruta)) return ruta
  const origen = String(api.defaults.baseURL || '').replace(/\/api\/?$/, '')
  return `${origen}${ruta.startsWith('/') ? '' : '/'}${ruta}`
}
