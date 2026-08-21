import axios from 'axios'

// La API vive en otro servicio de Render, no en el mismo origen que esta
// aplicación, así que hay que decir explícitamente dónde está.
const API_PRODUCCION = 'https://sistema-facturas-cr-web.onrender.com/api';

const esLocal = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);

// Configuración de URL dinámica para desarrollo y producción
const getBaseURL = () => {
  // Lo que mande la configuración del build gana siempre.
  if (import.meta.env.VITE_API_URL) {
    const url = import.meta.env.VITE_API_URL;
    return url.endsWith('/api') ? url : `${url}/api`;
  }

  // Sin VITE_API_URL, la regla es el TIPO de origen y no un dominio puntual.
  //
  // Antes acá se comparaba contra 'sistema-facturas-cr.onrender.com'. Como
  // frontend/.env está en .gitignore, ese respaldo es lo único que queda si
  // Render pierde la variable — y al poner un dominio propio (por ejemplo
  // para repartir el catálogo a los clientes) la comparación dejaría de
  // coincidir y CADA visitante intentaría llamar a la API en su propia
  // máquina, en localhost:3000. La página cargaría vacía sin ningún error
  // visible, y solo en producción.
  //
  // Con esto, cualquier dominio que no sea local apunta a la API de
  // producción, y cambiar de dominio deja de ser algo que pueda romperlo.
  return esLocal() ? 'http://localhost:3000/api' : API_PRODUCCION;
}

const baseURL = getBaseURL();

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
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      localStorage.removeItem(TOKEN_KEY)
      if (!window.location.pathname.startsWith('/ingresar')) {
        window.location.href = '/ingresar'
      }
    }

    // Manejo de errores comunes
    if (error.response?.status === 404) {
      console.warn('Recurso no encontrado')
    } else if (error.response?.status === 500) {
      console.error('Error interno del servidor')
    }
    
    return Promise.reject(error)
  }
)

export default api