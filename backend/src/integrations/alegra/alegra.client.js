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
   * Petición genérica con reintentos, devolviendo response.data DIRECTO
   * (sin el envelope {success,data} de get/post/put/delete). LANZA en
   * error. Migrado de AlegraService.makeRequest para casos de uso
   * genéricos/paginados (fetchAllParallel de facturación) que no encajan
   * en un servicio de dominio específico.
   */
  async request(method, endpoint, params = {}) {
    try {
      console.log(`📡 request: ${method} ${endpoint}`);

      const config = {
        method: method.toLowerCase(),
        url: endpoint,
        params: method.toUpperCase() === 'GET' ? params : undefined,
        data: method.toUpperCase() !== 'GET' ? params : undefined
      };

      const response = await this.requestWithRetry(
        () => this.api.request(config), 3, 1000, { metodo: method }
      );

      return response.data;
    } catch (error) {
      console.error(`❌ request error:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Ejecutar una petición con reintentos y backoff exponencial.
   *
   * EL MÉTODO IMPORTA, Y ANTES NO SE MIRABA
   * Esto reintentaba cualquier petición que fallara por red o timeout, sin
   * distinguir si era una lectura o una escritura. Para un GET está bien. Para
   * un POST es peligroso: un timeout NO significa que Alegra no hizo nada,
   * significa que no escuchamos la respuesta. Si Alegra creó la factura y
   * tardó en contestar, cada reintento creaba OTRA — hasta cuatro documentos
   * fiscales de un solo clic. Lo mismo con los ajustes de inventario, que
   * podían aplicarse cuatro veces y descuadrar el stock.
   *
   * Ahora:
   *   lecturas (GET)   reintentan ante red, timeout y 429/502/503/504
   *   escrituras       SOLO ante 429, que es el único caso en que consta que
   *                    el servidor rechazó la petición sin procesarla
   *
   * `opciones.metodo` es OBLIGATORIO en la práctica: si no se dice, se asume
   * escritura. Es la suposición segura — equivocarse hacia "no reintento"
   * cuesta un reintento manual; equivocarse hacia "reintento" cuesta una
   * factura duplicada ante Hacienda.
   *
   * @param {Function} requestFn - Función que retorna la promesa de la petición
   * @param {number} maxRetries
   * @param {number} initialDelay
   * @param {{metodo?: string}} opciones - método HTTP real de la petición
   */
  async requestWithRetry(requestFn, maxRetries = 3, initialDelay = 1000, opciones = {}) {
    const metodo = String(opciones.metodo || 'DESCONOCIDO').toUpperCase();
    const esLectura = metodo === 'GET' || metodo === 'HEAD' || metodo === 'OPTIONS';

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

        // Sin respuesta no se sabe si la petición llegó a ejecutarse. Para una
        // lectura da igual; para una escritura, reintentar es lo que duplica.
        const sinRespuesta = error.code === 'ECONNABORTED' ||
            error.code === 'ETIMEDOUT' ||
            error.code === 'ENOTFOUND' ||
            error.code === 'ECONNRESET' ||
            !error.response;

        if (sinRespuesta) {
          shouldRetry = esLectura;
          if (!esLectura) {
            console.warn(`⛔ ${metodo} sin respuesta (${error.code || 'sin código'}): NO se reintenta. ` +
              `Alegra pudo haberla procesado y reintentar la duplicaría. Hay que verificar antes de reenviar.`);
          }
        }

        if (error.response?.status) {
          const status = error.response.status;
          // 429 es el único que confirma que NO se procesó: el servidor la
          // rechazó por exceso de peticiones. 502/503/504 pueden haberse
          // ejecutado detrás del proxy, así que solo se reintentan en lectura.
          if (status === 429) {
            shouldRetry = true;
            console.log(`⚠️ Límite de peticiones (429), se reintenta`);
          } else if ((status === 502 || status === 503 || status === 504) && esLectura) {
            shouldRetry = true;
            console.log(`⚠️ Error del servidor: ${status} - ${error.response.statusText}`);
          } else if (status === 502 || status === 503 || status === 504) {
            console.warn(`⛔ ${metodo} devolvió ${status}: NO se reintenta, pudo haberse ejecutado.`);
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
