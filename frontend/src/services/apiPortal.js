import axios from 'axios'
import { traeSesion, sesionTraspasada } from '../utils/urlPortal'

/**
 * Cliente HTTP del PORTAL DE CLIENTES.
 *
 * Instancia aparte de api.js a propósito. Son dos sesiones distintas que
 * pueden convivir en el mismo navegador —alguien de la casa probando el
 * portal, por ejemplo— y con una sola instancia el token del personal
 * viajaría a las rutas del cliente y viceversa. En el backend eso ya está
 * cubierto (secretos de firma distintos, ver portal-clientes.auth.js); acá
 * se evita además el ruido de mandar credenciales a donde no corresponden.
 *
 * Por eso también la llave de localStorage es otra: cerrar sesión en el
 * sistema no debe echar al cliente, ni al revés.
 */

export const TOKEN_PORTAL_KEY = 'portal_cliente_token'

const getBaseURL = () => {
  if (import.meta.env.VITE_API_URL) {
    const url = import.meta.env.VITE_API_URL
    return url.endsWith('/api') ? url : `${url}/api`
  }
  // Mismo origen: el servicio que sirve esta página es el que responde /api.
  // Acá había un host escrito a mano que hoy devuelve 404 en todo, y por eso
  // `/api/portal/yo` fallaba con un error de CORS.
  const esLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname)
  return esLocal ? 'http://localhost:3000/api' : `${window.location.origin}/api`
}

const apiPortal = axios.create({
  baseURL: getBaseURL(),
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' }
})

export function setTokenPortal(token) {
  if (token) localStorage.setItem(TOKEN_PORTAL_KEY, token)
  else localStorage.removeItem(TOKEN_PORTAL_KEY)
}

/**
 * Del lado del sitio de siempre (IrAlPortal): la sesión del cliente para
 * llevarla al portal. Se MUDA, no se copia: si quedara también acá, «Salir»
 * en el portal no cerraría nada, porque el próximo enlace viejo la volvería
 * a traer.
 */
export function sacarSesionParaElPortal() {
  const token = localStorage.getItem(TOKEN_PORTAL_KEY)
  if (token) setTokenPortal(null)
  return token
}

/**
 * Del lado del portal, antes de dibujar: guarda la sesión que trae un
 * cliente redirigido desde el sitio de siempre (ver utils/urlPortal.js) y
 * borra el fragmento de la dirección en el acto, para que no quede en la
 * barra ni en el historial. No pisa una sesión que el portal ya tenga.
 */
export function recibirSesionTraspasada(origenSistema = import.meta.env.VITE_SISTEMA_URL || 'https://sistema-facturas-cr.onrender.com') {
  const { hash, pathname, search } = window.location
  if (!traeSesion(hash)) return
  const token = sesionTraspasada(hash, document.referrer, origenSistema)
  window.history.replaceState(window.history.state, '', `${pathname}${search}`)
  if (token && !localStorage.getItem(TOKEN_PORTAL_KEY)) setTokenPortal(token)
}

apiPortal.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_PORTAL_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

apiPortal.interceptors.response.use(
  (r) => r,
  (error) => {
    // Solo se cierra la sesión ante un 401 de verdad. Un fallo de red no
    // debe echar al cliente que está armando su pedido con mala señal.
    const url = error.config?.url || ''
    const esIngreso = url.includes('/portal/entrar') || url.includes('/portal/activar')
    if (error.response?.status === 401 && !esIngreso) {
      setTokenPortal(null)
      if (!window.location.pathname.startsWith('/portal/ingresar')) {
        window.location.href = '/portal/ingresar'
      }
    }
    return Promise.reject(error)
  }
)

export default apiPortal
