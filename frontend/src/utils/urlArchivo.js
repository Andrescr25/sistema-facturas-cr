import api from '../services/api'

/**
 * La dirección para mostrar un archivo guardado por el sistema.
 *
 * Las fotos propias se guardan como ruta ("/archivos/productos/7-….jpg") y
 * las sirve el backend, que NO está en la dirección de la web: en desarrollo
 * son puertos distintos y en Render, dos servicios. La ruta se completa con
 * el origen de la API. Puesta a secas en un <img> da 404 en producción
 * (2026-10-10: ninguna pantalla mostraba fotos salvo Gestión de Catálogo).
 * Una URL completa (las fotos que todavía vienen de Alegra) se deja igual.
 */
export function urlArchivo(ruta) {
  if (!ruta) return null
  if (/^(https?:|data:|blob:)/i.test(ruta)) return ruta
  const origen = String(api.defaults.baseURL || '').replace(/\/api\/?$/, '')
  return `${origen}${ruta.startsWith('/') ? '' : '/'}${ruta}`
}
