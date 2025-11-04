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
