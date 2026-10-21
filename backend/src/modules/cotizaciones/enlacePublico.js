/**
 * El enlace público de una cotización.
 *
 * PARA QUÉ
 * Al cliente se le manda la cotización en PDF por WhatsApp, pero el PDF no
 * lleva fotos: quien no conoce el producto lee "ROLLO BOLSA GDE.1X41 BASURA
 * EZ" y no sabe qué le están ofreciendo. El enlace abre la misma cotización
 * en el navegador, con la foto de cada producto.
 *
 * POR QUÉ UN TOKEN FIRMADO Y NO EL NÚMERO
 * Con /cotizacion/8 cualquiera podría recorrer /cotizacion/1, /2, /3… y ver
 * las cotizaciones de todos los clientes, con sus nombres y sus precios. El
 * token lleva una firma que solo este servidor puede calcular, así que no se
 * adivina ni se recorre.
 *
 * POR QUÉ SIN TABLA
 * La firma se deriva del id con el secreto de la aplicación: el mismo id da
 * siempre el mismo enlace, no hay nada que guardar ni que limpiar después. Lo
 * único que se pierde es poder anular un enlace sin borrar la cotización —
 * para una cotización eso no hace falta: si no se quiere que se vea más, se
 * elimina y el enlace muere con ella.
 *
 * DOS ESPACIOS DE FIRMA, Y NO ES DECORACIÓN
 * Los enlaces que ya salieron por WhatsApp llevan el id de ALEGRA firmado
 * como "cotizacion:<id>". Las cotizaciones propias tienen ids propios, que
 * arrancan en 1: si se firmaran igual, el enlace viejo de la cotización 11
 * de Alegra abriría nuestra cotización 11 — la de otro cliente, con su
 * nombre y sus precios. Las propias se firman como "cotizacion-propia:<id>";
 * un token viejo se reconoce como LEGADO y se busca por `alegra_id`.
 */

const crypto = require('crypto');

function secreto() {
  const s = process.env.JWT_SECRET || process.env.JWT_SECRETO;
  if (!s) throw new Error('Falta JWT_SECRET para firmar el enlace de la cotización.');
  return s;
}

const PROPIA = 'cotizacion-propia';
const LEGADO = 'cotizacion';

function firmar(id, espacio) {
  return crypto
    .createHmac('sha256', secreto())
    .update(`${espacio}:${id}`)
    .digest('base64url')
    .slice(0, 22);
}

/** El token que va en la URL: el id propio y su firma. */
function tokenDe(id) {
  return `${id}-${firmar(id, PROPIA)}`;
}

/** Iguales en tiempo constante: comparar con === filtra la firma correcta a quien mida cuánto tarda en fallar. */
function iguales(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Lo que hay dentro de un token: `{ id, legado }`, o null si la firma no
 * cuadra con ninguno de los dos espacios.
 *
 * `legado: true` quiere decir que el id es de Alegra (un enlace mandado antes
 * de la migración) y hay que buscarlo por `alegra_id`, nunca por `id`.
 */
function leerToken(token) {
  const texto = String(token || '');
  // El PRIMER guion, no el último: el alfabeto base64url incluye '-', así que
  // la firma puede traer los suyos. Partiendo por el último, un token como
  // "8-abc-def" daba el id "8-abc" y el enlace no abría. El id es solo
  // dígitos, así que el primer guion es siempre el separador.
  const guion = texto.indexOf('-');
  if (guion <= 0) return null;

  const id = texto.slice(0, guion);
  const firma = texto.slice(guion + 1);
  if (!/^\d+$/.test(id)) return null;

  if (iguales(firmar(id, PROPIA), firma)) return { id, legado: false };
  if (iguales(firmar(id, LEGADO), firma)) return { id, legado: true };
  return null;
}

/**
 * La dirección completa que se le manda al cliente. Va al portal de clientes
 * (PORTAL_URL) cuando está separado del sistema interno; si no, al sitio de
 * siempre, que la redirige allá cuando el portal ya existe.
 */
function enlaceDe(id) {
  const base = (process.env.PORTAL_URL || process.env.APP_URL || 'https://sistema-facturas-cr.onrender.com').replace(/\/+$/, '');
  return `${base}/cotizacion/${tokenDe(id)}`;
}

module.exports = { tokenDe, leerToken, enlaceDe };
