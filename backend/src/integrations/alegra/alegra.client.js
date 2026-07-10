/**
 * Cliente HTTP para Alegra API
 * Maneja todas las peticiones HTTP a la API de Alegra
 */

const axios = require('axios');
const alegraConfig = require('./alegra.config');

class AlegraClient {
  constructor() {
    this.baseURL = alegraConfig.baseURL;
    this.credentials = alegraConfig.credentials;

    this.api = axios.create({
      baseURL: this.baseURL,
      auth: {
        username: this.credentials.user,
        password: this.credentials.token
      },
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: alegraConfig.timeout
    });

    this.setupInterceptors();
  }

  /**
   * Configurar interceptores para logging y manejo de errores
   */
  setupInterceptors() {
    // Request interceptor
    this.api.interceptors.request.use(
      (config) => {
        console.log(`🔄 Alegra Request: ${config.method.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('❌ Alegra Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.api.interceptors.response.use(
      (response) => {
        console.log(`✅ Alegra Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        console.error('❌ Alegra API Error:', error.response?.status, error.response?.data);
        return Promise.reject(error);
      }
    );
  }

  /**
   * GET request
   */
  async get(endpoint, params = {}) {
    try {
      const response = await this.api.get(endpoint, { params });
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * POST request
   */
  async post(endpoint, data) {
    try {
      const response = await this.api.post(endpoint, data);
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * PUT request
   */
  async put(endpoint, data) {
    try {
      const response = await this.api.put(endpoint, data);
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * DELETE request
   */
  async delete(endpoint) {
    try {
      const response = await this.api.delete(endpoint);
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Ejecutar una petición con reintentos y backoff exponencial.
   * Reintenta en errores de red/timeout y en 429/502/503/504.
   * @param {Function} requestFn - Función que retorna la promesa de la petición
   */
  async requestWithRetry(requestFn, maxRetries = 3, initialDelay = 1000) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries) {
          console.error(`❌ Falló después de ${maxRetries + 1} intentos`);
          throw error;
        }

        let shouldRetry = false;

        if (error.code === 'ECONNABORTED' ||
            error.code === 'ETIMEDOUT' ||
            error.code === 'ENOTFOUND' ||
            error.code === 'ECONNRESET' ||
            !error.response) {
          shouldRetry = true;
        }

        if (error.response?.status) {
          const status = error.response.status;
          if (status === 429 || status === 502 || status === 503 || status === 504) {
            shouldRetry = true;
            console.log(`⚠️ Error del servidor: ${status} - ${error.response.statusText}`);
          }
        }

        if (!shouldRetry) {
          throw error;
        }

        const delay = initialDelay * Math.pow(2, attempt);
        console.log(`⏳ Reintento ${attempt + 1}/${maxRetries} en ${delay}ms... (Razón: ${error.code || error.response?.status})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Manejo centralizado de errores
   */
  handleError(error) {
    const errorResponse = {
      success: false,
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    };

    if (error.response) {
      console.error(`❌ Alegra Error ${error.response.status}:`, error.response.data);
    } else if (error.request) {
      console.error('❌ No response from Alegra:', error.request);
    } else {
      console.error('❌ Request setup error:', error.message);
    }

    return errorResponse;
  }
}

// Singleton instance
let instance = null;

module.exports = {
  getInstance: () => {
    if (!instance) {
      instance = new AlegraClient();
    }
    return instance;
  }
};
