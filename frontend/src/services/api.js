import axios from 'axios'

// LA API VIVE EN EL MISMO ORIGEN QUE ESTA APLICACIÓN.
//
// Acá decía lo contrario y apuntaba a `sistema-facturas-cr-web.onrender.com`.
// Ese host hoy devuelve 404 en todo: el servicio que sirve la página es el
// mismo que responde `/api`. Como un 404 de otro servicio no trae cabeceras
// CORS, el navegador lo reportaba como "blocked by CORS policy" y la pantalla
// decía "Network error" —que es justo lo que se veía al revisar precios y al
// entrar al portal—.
//
// Se usa el origen actual y no un dominio escrito a mano: así sigue
// funcionando si mañana se le pone un dominio propio al catálogo, y no hay
// CORS que configurar porque no hay cruce de origen.

const esLocal = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);

// Configuración de URL dinámica para desarrollo y producción
const getBaseURL = () => {
  // Lo que mande la configuración del build gana siempre.
  if (import.meta.env.VITE_API_URL) {
    const url = import.meta.env.VITE_API_URL;
    return url.endsWith('/api') ? url : `${url}/api`;
  }

  // En local, la API corre aparte en el 3000. En cualquier otro lado, es el
  // mismo servidor que entregó esta página.
  return esLocal() ? 'http://localhost:3000/api' : `${window.location.origin}/api`;
}

const baseURL = getBaseURL();
export const API_BASE_URL = baseURL;

// Configuración base del cliente API
const api = axios.create({
  baseURL: baseURL,
  timeout: 180000, // 3 minutos para procesos largos (actualización de múltiples productos)
  headers: {
    'Content-Type': 'application/json',
  },
})

export const TOKEN_KEY = 'sistema_facturas_token'

/**
 * Guarda (o borra) el token de sesión. Se centraliza acá para que este sea
 * el único lugar del frontend que sabe dónde vive: AuthContext lo llama al
 * entrar y al salir, y el interceptor de abajo lo lee en cada llamada.
 */
export function setTokenSesion(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

// Interceptor para requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => {
    console.error('API Request Error:', error)
    return Promise.reject(error)
  }
)

// Interceptor para responses
api.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    console.error('API Response Error:', {
      status: error.response?.status,
      message: error.message,
      url: error.config?.url
    })
    
    // Sesión vencida o token inválido: se borra y se manda a la pantalla de
    // ingreso. Sin esto la aplicación queda dibujada pero muerta, fallando
    // cada pantalla por su cuenta sin decir que hay que volver a entrar.
    // Se excluye el propio login para no reemplazar su mensaje de error.
    //
    // EXCEPTO EN EL CATÁLOGO DEL AGENTE, que está hecho para usarse sin sesión
    // (zonas sin señal; la sesión dura 12 horas). Ahí un 401 es de una parte
    // opcional —el orden de Gestión de Catálogo, la rotación— y mandar al
    // ingreso cortaba la actualización a la mitad, justo antes de bajar las
    // fotos: el catálogo quedaba en orden alfabético y sin imágenes
    // (2026-09-27, reproducido). La pantalla avisa lo que no se actualizó.
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      localStorage.removeItem(TOKEN_KEY)
      const pantallaSinSesion = window.location.pathname.startsWith('/catalogo-agente')
      if (!pantallaSinSesion && !window.location.pathname.startsWith('/ingresar')) {
        window.location.href = '/ingresar'
      }
    }

    // Manejo de errores comunes.
    //
    // En el 500 se escribe el mensaje QUE MANDÓ EL SERVIDOR, no el rótulo
    // "Error interno del servidor" que había antes: ese texto tapaba en la
    // consola la explicación real —por ejemplo, cuál número de proveedor no
    // tiene WhatsApp— y mandaba a buscar el problema al lugar equivocado.
    if (error.response?.status === 404) {
      console.warn('Recurso no encontrado')
    } else if (error.response?.status === 500) {
      console.error(error.response?.data?.message || 'Error interno del servidor')
    }
    
    return Promise.reject(error)
  }
)

export default api
