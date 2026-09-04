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
 */

const crypto = require('crypto');

function secreto() {
  const s = process.env.JWT_SECRET || process.env.JWT_SECRETO;
  if (!s) throw new Error('Falta JWT_SECRET para firmar el enlace de la cotización.');
  return s;
}

function firmar(id) {
  return crypto
    .createHmac('sha256', secreto())
    .update(`cotizacion:${id}`)
    .digest('base64url')
    .slice(0, 22);
}

/** El token que va en la URL: el número y su firma. */
function tokenDe(id) {
  return `${id}-${firmar(id)}`;
}

/**
 * El id que hay dentro de un token, o null si la firma no cuadra.
 *
 * La comparación es de tiempo constante: comparar con === filtra información
 * sobre la firma correcta a quien mida cuánto tarda en fallar.
 */
function idDesdeToken(token) {
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

  const esperada = Buffer.from(firmar(id));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length) return null;
  if (!crypto.timingSafeEqual(esperada, recibida)) return null;

  return id;
}

/** La dirección completa que se le manda al cliente. */
function enlaceDe(id) {
  const base = (process.env.APP_URL || 'https://sistema-facturas-cr.onrender.com').replace(/\/+$/, '');
  return `${base}/cotizacion/${tokenDe(id)}`;
}

module.exports = { tokenDe, idDesdeToken, enlaceDe };
