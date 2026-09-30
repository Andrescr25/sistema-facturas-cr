/**
 * El único lugar del sistema que manda mensajes de WhatsApp.
 *
 * DOS CANALES (2026-09-29). El de adentro (conexion.js: Baileys corriendo en
 * este mismo servidor, WHATSAPP_PROVEEDOR=interno) y Evolution API, el
 * servicio aparte de antes. Mientras el teléfono no esté vinculado adentro,
 * todo sigue saliendo por Evolution: la mudanza no corta los envíos. Una
 * vez vinculado, Evolution se puede apagar (quitar WHATSAPP_API_URL).
 *
 * POR QUÉ EXISTE
 * Hasta ahora había dos copias de esta llamada —la orden de compra al
 * proveedor y el enlace de invitación al portal— y cada una leía las
 * variables de entorno por su lado, armaba el payload por su lado y traducía
 * los errores por su lado. Con los envíos de cotizaciones, facturas, saldos y
 * avisos encima serían seis, y el día que Evolution cambie algo habría que
 * arreglarlo en seis lugares.
 *
 * EL NÚMERO SE VALIDA ACÁ, SIEMPRE
 * No es una comodidad: por estos mensajes salen documentos del cliente —su
 * factura, su cotización, su saldo— y mandarlos a un número equivocado es
 * entregárselos a un desconocido. Antes solo el camino de la invitación
 * validaba; ahora no hay forma de saltárselo.
 */

const axios = require('axios');
const { salidasBloqueadas, errorSalidaBloqueada } = require('../../../config/aislado');
const { validarTelefonoEscrito } = require('../../utils/telefonosCliente');
const interno = require('./conexion');

// Cuánto se espera al canal de adentro si está vinculado pero reconectando
// (un despliegue, un corte): el turno pasa de una copia a otra en segundos.
const ESPERA_INTERNO_MS = 20000;

// Evolution responde despacio la primera vez del día: corre en Render y se
// duerme sin tráfico. Despertarlo toma 20-30 segundos, medido en vivo.
const TIEMPO_ESPERA_MS = 90000;

function configuracion() {
  return {
    url: process.env.WHATSAPP_API_URL || 'http://localhost:8080',
    clave: process.env.WHATSAPP_API_KEY || '',
    instancia: process.env.WHATSAPP_INSTANCE_NAME || 'facturas_instance'
  };
}

/**
 * Convierte un fallo de Evolution API en algo que se pueda leer y arreglar.
 *
 * Antes el error de axios subía tal cual y el usuario veía "Request failed
 * with status code 400" — o peor, el genérico "Error interno del servidor".
 * Con eso no hay forma de saber si el problema es el número, el WhatsApp
 * desvinculado o una variable mal puesta en Render, que son arreglos
 * completamente distintos. Diagnosticar el 400 de un número sin WhatsApp
 * costó una sesión entera.
 *
 * El texto es para quien está en el mostrador, no para quien programó.
 *
 * `sujeto` es a quién señalar cuando el número no recibe: "proveedor" en una
 * orden de compra, "cliente" en todo lo demás.
 */
function explicarFallo(error, { telefono, url, instancia, sujeto = 'cliente' } = {}) {
  const status = error.response?.status;
  const detalle = error.response?.data;
  const textoDetalle = JSON.stringify(detalle || '').toLowerCase();
  const waUrl = url || configuracion().url;
  const waInstance = instancia || configuracion().instancia;

  // Ni siquiera se llegó al servidor.
  if (!error.response) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
      return `No se pudo contactar el servidor de WhatsApp en ${waUrl}. Revise que esté encendido y que WHATSAPP_API_URL apunte a la dirección correcta.`;
    }
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return `El servidor de WhatsApp (${waUrl}) no respondió a tiempo. Si es el primer envío del día puede estar despertando; intente de nuevo en un momento.`;
    }
    return `No se pudo contactar el servidor de WhatsApp en ${waUrl}: ${error.message}`;
  }

  if (status === 401 || status === 403) {
    return 'El servidor de WhatsApp rechazó la clave de acceso. Revise que WHATSAPP_API_KEY sea la misma que tiene configurada Evolution API.';
  }

  if (status === 404) {
    return `No existe una instancia de WhatsApp llamada "${waInstance}" en ${waUrl}. El nombre debe coincidir exactamente con el de Evolution API (variable WHATSAPP_INSTANCE_NAME).`;
  }

  // La instancia existe pero el teléfono no está vinculado.
  if (textoDetalle.includes('not connected') || textoDetalle.includes('close') || textoDetalle.includes('disconnected')) {
    return `La instancia "${waInstance}" no está conectada a WhatsApp. Vuelva a vincular el teléfono escaneando el código QR en Evolution API.`;
  }

  // Lo más común de todos: el número no tiene WhatsApp. Evolution contesta
  // 400 sin decir por qué, así que se nombra la causa probable en vez de
  // repetir el código de estado.
  if (status === 400) {
    return `El número ${telefono} no pudo recibir el mensaje. Lo más probable es que no tenga WhatsApp (por ejemplo, si es un teléfono fijo) o que esté mal escrito. Verifique el número del ${sujeto}.`;
  }

  const mensajeEvolution = detalle?.message || detalle?.error || error.message;
  return `El servidor de WhatsApp devolvió un error (${status}): ${typeof mensajeEvolution === 'string' ? mensajeEvolution : JSON.stringify(mensajeEvolution)}`;
}

function errorDeEnvio(mensaje, status = 502) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

/** Deja el número listo para Evolution, o falla diciendo por qué no sirve. */
function prepararNumero(telefono) {
  const revision = validarTelefonoEscrito(telefono);
  if (!revision.valido) throw errorDeEnvio(revision.motivo, 400);
  return revision;
}

/** Por dónde sale el mensaje: 'interno' o 'evolution'. */
async function canal() {
  // Rama aislada: ni por Evolution ni por la conexión de adentro. Ver
  // config/aislado.js. Va acá, antes de elegir, porque el canal de adentro
  // (conexion.js) no pasa por `postear`, donde estaba el bloqueo original.
  if (salidasBloqueadas()) throw errorSalidaBloqueada('enviar mensajes de WhatsApp');
  if (interno.habilitado()) {
    const e = interno.estado();
    if (e.conectado) return 'interno';
    if (e.vinculado && await interno.esperarConexion(ESPERA_INTERNO_MS)) return 'interno';
  }
  if (process.env.WHATSAPP_API_URL) return 'evolution';
  throw errorDeEnvio(interno.habilitado()
    ? (interno.estado().vinculado
      ? 'WhatsApp se está reconectando. Intente de nuevo en un momento.'
      : 'WhatsApp no está vinculado en este sistema. Vincúlelo en Configuración → WhatsApp.')
    : 'WhatsApp no está configurado en el servidor.', 503);
}

/** Los fallos del canal de adentro, en el mismo idioma que los de Evolution. */
function explicarFalloInterno(error, { telefono, sujeto = 'cliente' }) {
  if (error.codigo === 'SIN_WHATSAPP') {
    return errorDeEnvio(`El número ${telefono} no pudo recibir el mensaje. Lo más probable es que no tenga WhatsApp (por ejemplo, si es un teléfono fijo) o que esté mal escrito. Verifique el número del ${sujeto}.`, 400);
  }
  if (error.codigo === 'SIN_CONEXION') {
    return errorDeEnvio('WhatsApp se está reconectando. Intente de nuevo en un momento.', 503);
  }
  return errorDeEnvio(`WhatsApp no pudo mandar el mensaje: ${error.message}`, error.status || 502);
}

async function mandarInterno(accion, { telefono, sujeto }) {
  try {
    return await accion();
  } catch (error) {
    throw explicarFalloInterno(error, { telefono, sujeto });
  }
}

async function postear(ruta, payload, { telefono, sujeto }) {
  // Rama aislada: no se le escribe a nadie de verdad. Ver config/aislado.js.
  if (salidasBloqueadas()) throw errorSalidaBloqueada('enviar mensajes de WhatsApp');
  const { url, clave, instancia } = configuracion();
  try {
    const r = await axios.post(`${url}/${ruta}/${instancia}`, payload, {
      headers: { 'Content-Type': 'application/json', apikey: clave },
      timeout: TIEMPO_ESPERA_MS
    });
    return r.data;
  } catch (error) {
    throw errorDeEnvio(explicarFallo(error, { telefono, url, instancia, sujeto }));
  }
}

/**
 * Un mensaje de texto.
 *
 * @returns {{ enviado: true, telefono: string, numero: string }}
 *          `telefono` legible para la pantalla, `numero` como lo usó WhatsApp.
 */
async function enviarTexto({ telefono, mensaje, sujeto = 'cliente' }) {
  const numero = prepararNumero(telefono);
  const texto = String(mensaje ?? '').trim();
  if (!texto) throw errorDeEnvio('El mensaje está vacío.', 400);

  const via = await canal();
  if (via === 'interno') {
    await mandarInterno(() => interno.enviarTexto(numero.numero, texto), { telefono: numero.formateado, sujeto });
  } else {
    await postear('message/sendText', { number: numero.numero, text: texto },
      { telefono: numero.formateado, sujeto });
  }

  return { enviado: true, telefono: numero.formateado, numero: numero.numero, via };
}

/**
 * Un PDF, con su texto de acompañamiento.
 *
 * EL PDF VIAJA EN EL MENSAJE, NO COMO ENLACE. Los PDF de Alegra vienen con
 * una URL firmada que caduca en unas 10 horas y es pública: mandarle esa URL
 * al cliente sería darle un enlace que se rompe al día siguiente y que
 * mientras tanto puede abrir cualquiera que lo reenvíe. Se baja en el
 * servidor y se manda el archivo.
 *
 * @param {Buffer} pdf contenido del archivo
 */
async function enviarDocumento({ telefono, mensaje, pdf, nombreArchivo, sujeto = 'cliente' }) {
  const numero = prepararNumero(telefono);
  if (!Buffer.isBuffer(pdf) || pdf.length === 0) {
    throw errorDeEnvio('No se pudo preparar el documento para enviar.', 500);
  }

  const archivo = nombreArchivo || 'documento.pdf';
  const pie = String(mensaje ?? '').trim() || undefined;
  const via = await canal();
  if (via === 'interno') {
    await mandarInterno(() => interno.enviarDocumento(numero.numero, pdf, archivo, pie), { telefono: numero.formateado, sujeto });
  } else {
    await postear('message/sendMedia', {
      number: numero.numero,
      mediatype: 'document',
      mimetype: 'application/pdf',
      media: pdf.toString('base64'),
      fileName: archivo,
      caption: pie
    }, { telefono: numero.formateado, sujeto });
  }

  return { enviado: true, telefono: numero.formateado, numero: numero.numero, via };
}

module.exports = { enviarTexto, enviarDocumento, explicarFallo, prepararNumero };
