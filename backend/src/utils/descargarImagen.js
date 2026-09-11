/**
 * Descarga una imagen desde una dirección que pegó una persona o que
 * sugirió el buscador de fotos.
 *
 * El servidor es quien descarga, así que una dirección maliciosa podría
 * hacerle pedir cosas de su propia red: la del proveedor de hosting
 * (169.254.169.254 entrega credenciales en muchos), localhost, la base de
 * datos. Por eso se resuelve el nombre y se rechaza cualquier dirección
 * interna, también en cada redirección (se siguen a mano, de a una, para
 * poder revisar cada salto).
 */

const axios = require('axios');
const dns = require('dns').promises;
const net = require('net');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const MAXIMO_BYTES = 5 * 1024 * 1024;
const MAXIMO_SALTOS = 3;

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expuesto = true; // mensaje nuestro, se puede mostrar tal cual
  return e;
}

function ipInterna(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    if (x === '::1' || x === '::') return true;
    if (x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb')) return true;
    const mapeada = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapeada ? ipInterna(mapeada[1]) : false;
  }
  return true;
}

async function revisarDireccion(texto, lookup) {
  let url;
  try { url = new URL(texto); } catch { throw httpError(400, 'La dirección de la imagen no es válida.'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw httpError(400, 'La imagen tiene que venir de una dirección http o https.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const direcciones = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (direcciones.length === 0) throw httpError(400, 'No se encontró el sitio de esa imagen.');
  if (direcciones.some(d => ipInterna(d.address))) throw httpError(400, 'Esa dirección apunta a una red interna y no se descarga.');
  return url;
}

/**
 * Lo que responde el sitio de la foto no es asunto de quien llama a nuestra
 * API: un 500 de un sitio ajeno no puede salir como un 500 nuestro, ni su
 * mensaje técnico ("Request failed with status code 400") llegar a la pantalla.
 * Todo se traduce a un 400 que dice qué pasó.
 */
function traducirFalloRemoto(error) {
  if (error.expuesto) return error;
  if (error.code === 'ECONNABORTED' || /timeout/i.test(error.message || '')) {
    return httpError(400, 'El sitio de la imagen tardó demasiado en responder.');
  }
  if (error.code === 'ERR_FR_MAX_BODY_LENGTH_EXCEEDED' || /maxContentLength/i.test(error.message || '')) {
    return httpError(400, 'La imagen de ese sitio pesa demasiado.');
  }
  const codigo = error.response?.status;
  if (codigo) return httpError(400, `El sitio de la imagen no la entregó (respondió ${codigo}). Pruebe con otra.`);
  return httpError(400, 'No se pudo conectar con el sitio de la imagen.');
}

async function descargarImagen(direccion, { cliente = axios, lookup = dns.lookup } = {}) {
  let actual = await revisarDireccion(direccion, lookup);
  for (let salto = 0; salto <= MAXIMO_SALTOS; salto++) {
    let r;
    try {
      r = await cliente.get(actual.toString(), {
      responseType: 'arraybuffer',
      timeout: 15000,
      maxRedirects: 0,
      maxContentLength: MAXIMO_BYTES,
      validateStatus: s => s >= 200 && s < 400,
      headers: { 'User-Agent': UA }
      });
    } catch (error) {
      throw traducirFalloRemoto(error);
    }
    if (r.status >= 300) {
      const destino = r.headers?.location;
      if (!destino) throw httpError(400, 'El sitio de la imagen redirigió sin decir a dónde.');
      actual = await revisarDireccion(new URL(destino, actual).toString(), lookup);
      continue;
    }
    return { buffer: Buffer.from(r.data), contentType: r.headers?.['content-type'] || '' };
  }
  throw httpError(400, 'El sitio de la imagen redirigió demasiadas veces.');
}

module.exports = { descargarImagen, ipInterna };
