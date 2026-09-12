/**
 * Cliente HTTP para Alegra API
 * Maneja todas las peticiones HTTP a la API de Alegra
 */

const axios = require('axios');
const alegraConfig = require('./alegra.config');
const { salidasBloqueadas, errorSalidaBloqueada } = require('../../../config/aislado');

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
        // Rama aislada: a Alegra solo se le lee. Todas las peticiones pasan
        // por esta instancia de axios, así que este es el único lugar donde
        // hace falta frenar una escritura. Ver config/aislado.js.
        const metodo = String(config.method || 'get').toLowerCase();
        if (metodo !== 'get' && salidasBloqueadas()) {
          return Promise.reject(errorSalidaBloqueada(`escribir en Alegra (${metodo.toUpperCase()} ${config.url})`));
        }
        console.log(`🔄 Alegra Request: ${config.method.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        // Solo el mensaje. El volcado completo del error de axios incluye
        // `_currentUrl`, y ahí la credencial de Alegra viaja dentro de la URL
        // (usuario:clave@api.alegra.com). Eso terminaba escrito en el registro
        // —y en Render, en los logs del servicio—. Se vio al fallar una página
        // por timeout durante la copia de cobros.
        console.error('❌ Alegra Request Error:', error.message);
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
   *   lecturas (GET)   reintentan ante red, timeout, límite de peticiones
   *                    y 502/503/504
   *   escrituras       SOLO ante el límite de peticiones, que es el único
   *                    caso en que consta que el servidor rechazó la
   *                    petición sin procesarla (ver limiteDePeticiones: no
   *                    llega como 429 sino como 400)
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
  /**
   * ¿Alegra rechazó esto por exceso de peticiones?
   *
   * ALEGRA NO CONTESTA 429. Contesta **HTTP 400** con el 429 metido en el
   * cuerpo:
   *
   *   { code: 429, message: 'Too many requests',
   *     headers: { 'x-rate-limit-limit': 100, 'x-rate-limit-reset': 54 } }
   *
   * Por eso la rama que reintentaba ante `status === 429` nunca se ejecutó:
   * en un solo arranque del servidor se contaron 20 límites y 0 reintentos.
   * El síntoma no era un error de límite, era un 400 genérico — y cada quien
   * lo interpretaba a su manera: la pantalla de cotizaciones se quedó sin
   * clientes, y un barrido de productos reportó 86 artículos "inexistentes"
   * que existían.
   *
   * `x-rate-limit-reset` son los segundos que faltan para que se abra la
   * ventana. Esperar menos es gastar un intento en un fallo seguro, así que
   * se respeta ese número en lugar del backoff.
   */
  limiteDePeticiones(error) {
    const cuerpo = error.response?.data || {};
    const esLimite = error.response?.status === 429 ||
      Number(cuerpo.code) === 429 ||
      /too many requests/i.test(String(cuerpo.message || ''));

    if (!esLimite) return { esLimite: false, esperaMs: 0 };

    const reset = Number(
      cuerpo.headers?.['x-rate-limit-reset'] ??
      error.response?.headers?.['x-rate-limit-reset'] ?? 0
    );
    // Tope de un minuto: la ventana de Alegra es por minuto, esperar más no
    // aporta y deja al usuario mirando una pantalla trabada.
    const esperaMs = reset > 0 ? Math.min(reset + 1, 60) * 1000 : 0;
    return { esLimite: true, esperaMs };
  }

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
        let esperaForzada = 0;   // la que pide Alegra; manda sobre el backoff

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

        // El límite de peticiones es el único caso que confirma que NO se
        // procesó: el servidor la rechazó de entrada. Por eso se reintenta
        // también en escritura, sin riesgo de duplicar.
        const limite = this.limiteDePeticiones(error);
        if (limite.esLimite) {
          shouldRetry = true;
          esperaForzada = limite.esperaMs;
          console.log(`⚠️ Límite de peticiones de Alegra` +
            (limite.esperaMs ? `, se reintenta en ${Math.round(limite.esperaMs / 1000)}s` : ', se reintenta'));
        }

        if (!limite.esLimite && error.response?.status) {
          const status = error.response.status;
          // 502/503/504 pueden haberse ejecutado detrás del proxy, así que
          // solo se reintentan en lectura.
          if ((status === 502 || status === 503 || status === 504) && esLectura) {
            shouldRetry = true;
            console.log(`⚠️ Error del servidor: ${status} - ${error.response.statusText}`);
          } else if (status === 502 || status === 503 || status === 504) {
            console.warn(`⛔ ${metodo} devolvió ${status}: NO se reintenta, pudo haberse ejecutado.`);
          }
        }

        if (!shouldRetry) {
          throw error;
        }

        const delay = esperaForzada || initialDelay * Math.pow(2, attempt);
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
