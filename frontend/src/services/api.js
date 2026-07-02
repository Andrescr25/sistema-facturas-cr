import axios from 'axios'

// Configuración de URL dinámica para desarrollo y producción
const getBaseURL = () => {
  // Si hay VITE_API_URL definida, usarla
  if (import.meta.env.VITE_API_URL) {
    const url = import.meta.env.VITE_API_URL;
    return url.endsWith('/api') ? url : `${url}/api`;
  }
  
  // Detectar si estamos en producción de Render
  if (window.location.origin.includes('sistema-facturas-cr.onrender.com')) {
    return 'https://sistema-facturas-cr-web.onrender.com/api';
  }
  
  // Desarrollo local
  return 'http://localhost:3000/api'
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

// Interceptor para requests
api.interceptors.request.use(
  (config) => {
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