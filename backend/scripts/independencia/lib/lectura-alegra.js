/**
 * Lector de la fuente histórica, exclusivo de los CLI de migración.
 * La aplicación no debe importarlo (inventarioDeAlegra.test.js lo vigila).
 * No contiene métodos de escritura ni entrega la instancia privada de Axios.
 * Incluso una llave de salida abierta no puede convertirlo en un escritor.
 */
const BASE_URL = 'https://api.alegra.com/api/v1';

function falloSeguro(e) {
  const status = Number(e?.response?.status ?? e?.status) || 0;
  const limite = status === 429 || (status === 400 && Number(e?.response?.data?.code) === 429);
  const reset = Number(e?.response?.data?.headers?.['x-rate-limit-reset'] ?? e?.response?.headers?.['x-rate-limit-reset']);
  const transitorio = limite || [502, 503, 504].includes(status) ||
    (!status && ['ETIMEDOUT', 'ECONNABORTED', 'ECONNRESET', 'EAI_AGAIN', 'ENETUNREACH'].includes(e?.code));
  const error = new Error(status ? `Lectura de Alegra rechazada (HTTP ${status}).` : 'No se pudo completar la lectura de Alegra.');
  error.status = status;
  const red = ['ETIMEDOUT', 'ECONNABORTED', 'ECONNRESET', 'EAI_AGAIN', 'ENETUNREACH'].includes(e?.code) ? e.code : null;
  error.code = limite ? 'LIMITE_LECTURA' : red || (transitorio ? 'LECTURA_TRANSITORIA' : 'LECTURA_FALLIDA');
  error.transitorio = transitorio;
  error.esperaMs = limite && Number.isFinite(reset) && reset > 0 ? Math.min(reset + 1, 60) * 1000 : 0;
  // Los conciliadores conocen el límite 400/429. No se devuelve el cuerpo
  // remoto: puede contener datos personales, enlaces firmados o credenciales.
  error.data = limite ? { code: 429, headers: Number.isFinite(reset) ? { 'x-rate-limit-reset': Math.max(0, Math.min(reset, 60)) } : {} } : {};
  return error;
}

function revisarRuta(ruta) {
  // Una URL absoluta o una ruta con segmentos escapados podría mandar la
  // autenticación a otro destino. Los CLI usan rutas simples de la API.
  if (typeof ruta !== 'string' || !/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(ruta)) {
    const e = new Error('La lectura requiere una ruta relativa simple de Alegra.');
    e.code = 'RUTA_LECTURA_INVALIDA'; e.status = 400; throw e;
  }
}

function crearLector({ transporte, esperar = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  let privado = transporte;
  const obtenerTransporte = () => {
    if (!privado) {
      if (!process.env.ALEGRA_USER || !process.env.ALEGRA_TOKEN) throw new Error('Faltan credenciales para leer la fuente histórica.');
      privado = require('axios').create({ baseURL: BASE_URL, timeout: 30000, maxRedirects: 0,
        auth: { username: process.env.ALEGRA_USER, password: process.env.ALEGRA_TOKEN },
        headers: { Accept: 'application/json' } });
    }
    return privado;
  };
  const leer = async (ruta, params = {}) => {
    revisarRuta(ruta);
    for (let intento = 0; intento < 3; intento++) {
      try {
        // No se propagan opciones Axios del llamador (auth, baseURL, method,
        // redirects, etc.). Esta interfaz solo admite parámetros de consulta.
        const r = await obtenerTransporte().get(ruta, { params });
        return { data: r.data };
      } catch (e) {
        const seguro = falloSeguro(e);
        if (!seguro.transitorio || intento === 2) throw seguro;
        await esperar(seguro.esperaMs || 1000 * (2 ** intento));
      }
    }
  };
  return Object.freeze({
    api: Object.freeze({ get: (ruta, opciones = {}) => leer(ruta, opciones.params) }),
    async get(ruta, params) {
      try { const r = await leer(ruta, params); return { success: true, data: r.data }; }
      catch (e) { return { success: false, status: e.status || 0, error: e.code || 'LECTURA_FALLIDA', data: e.data || {} }; }
    },
    async request(metodo, ruta, params) {
      if (String(metodo).toUpperCase() !== 'GET') {
        const e = new Error('Los scripts de migración solo pueden leer Alegra mediante GET.');
        e.code = 'SALIDA_BLOQUEADA'; e.status = 423; throw e;
      }
      return (await leer(ruta, params)).data;
    }
  });
}

let instancia;
const getInstance = () => instancia ||= crearLector();
module.exports = { crearLector, getInstance, getClient: getInstance };
