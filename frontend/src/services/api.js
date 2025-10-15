import axios from 'axios'

// DEBUG: Mostrar todas las variables de entorno
console.log('🔍 DEBUG Environment Variables:');
console.log('VITE_API_URL:', import.meta.env.VITE_API_URL);
console.log('MODE:', import.meta.env.MODE);
console.log('PROD:', import.meta.env.PROD);
console.log('All VITE vars:', Object.keys(import.meta.env).filter(key => key.startsWith('VITE_')));

// Configuración de URL dinámica para desarrollo y producción
const getBaseURL = () => {
  console.log('🔍 getBaseURL called');
  console.log('   VITE_API_URL:', import.meta.env.VITE_API_URL);
  console.log('   MODE:', import.meta.env.MODE);
  console.log('   PROD:', import.meta.env.PROD);
  console.log('   window.location.origin:', window.location.origin);
  
  // Si hay VITE_API_URL definida, usarla
  if (import.meta.env.VITE_API_URL) {
    const url = import.meta.env.VITE_API_URL;
    const apiUrl = url.endsWith('/api') ? url : `${url}/api`;
    console.log('✅ Using VITE_API_URL:', apiUrl);
    return apiUrl;
  }
  
  // Detectar si estamos en producción de Render
  if (window.location.origin.includes('sistema-facturas-cr.onrender.com')) {
    const apiUrl = 'https://sistema-facturas-cr-web.onrender.com/api';
    console.log('✅ Detected Render production, using:', apiUrl);
    return apiUrl;
  }
  
  // Desarrollo local
  console.log('⚠️ Using development URL: http://localhost:3000/api');
  return 'http://localhost:3000/api'
}

const baseURL = getBaseURL();
console.log('🔗 Final baseURL:', baseURL);

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
    console.log(`🔄 API Request: ${config.method?.toUpperCase()} ${config.url}`)
    console.log(`🔗 Full URL: ${config.baseURL}${config.url}`)
    return config
  },
  (error) => {
    console.error('❌ API Request Error:', error)
    return Promise.reject(error)
  }
)

// Interceptor para responses
api.interceptors.response.use(
  (response) => {
    console.log(`✅ API Response: ${response.status} - ${response.config.url}`)
    return response
  },
  (error) => {
    console.error('❌ API Response Error:', {
      status: error.response?.status,
      message: error.message,
      url: error.config?.url
    })
    
    // Manejo de errores comunes
    if (error.response?.status === 404) {
      console.warn('⚠️ Recurso no encontrado')
    } else if (error.response?.status === 500) {
      console.error('🔥 Error interno del servidor')
    }
    
    return Promise.reject(error)
  }
)

export default api