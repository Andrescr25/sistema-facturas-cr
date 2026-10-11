/**
 * Entregar una factura emitida por correo con el PDF propio adjunto.
 * La ficha propone el destinatario; una persona lo confirma. El remitente
 * lo decide mailer (la cuenta del buzón por omisión), nunca la petición.
 * Aceptación SMTP no prueba recepción: tampoco se reintenta automáticamente
 * cuando la conexión falla después de que el servidor pudo aceptar el envío.
 */
const { pool } = require('../../../config/database');
const mailer = require('../../../services/mailer');
const { salidasBloqueadas, errorSalidaBloqueada } = require('../../../config/aislado');
const { httpError, correo } = require('../../utils/validacion');
const { obtenerFactura } = require('./facturaConsulta.service');
const { generarPdfFactura } = require('./factura.pdf');

function direccion(valor) {
  // Un solo buzón explícito: arrays, listas y objetos de nodemailer permitirían
  // mandar el documento a más personas que la que se confirmó en pantalla.
  if (typeof valor !== 'string' || !valor.trim()) throw httpError(400, 'Escribí un correo de destinatario.');
  if (/[<>"()\[\]\\:]/.test(valor)) throw httpError(400, 'Escribí una sola dirección de correo, sin nombres ni listas.');
  return correo(160)(valor, 'Correo del destinatario');
}

function texto(valor, etiqueta, maximo, encabezado = false) {
  if (typeof valor !== 'string' || !valor.trim()) throw httpError(400, `Escribí ${etiqueta}.`);
  if (valor.length > maximo || (encabezado && /[\r\n]/.test(valor))) {
    throw httpError(400, `${etiqueta} no es válido (máximo ${maximo} caracteres).`);
  }
  return valor.trim();
}

function exigirEmitida(factura) {
  if (factura.estado !== 'emitida') throw httpError(409, 'Solo se mandan por correo las facturas emitidas.');
}

async function datosCorreoFactura(id) {
  const factura = await obtenerFactura(id);
  exigirEmitida(factura);
  let propuesta = factura.cliente?.correo || '';
  if (factura.cliente?.id) {
    const { rows } = await pool.query('SELECT correo FROM cliente WHERE id = $1', [factura.cliente.id]);
    // Si se quitó un correo de la ficha, no resucitarlo desde la fotografía
    // histórica del documento. Esa fotografía sí se conserva en el PDF.
    if (rows[0]) propuesta = rows[0].correo || '';
  }
  try { propuesta = direccion(propuesta); } catch { propuesta = ''; }
  return {
    numero: factura.numero, para: propuesta, remitente: mailer.remitente() || '',
    configurado: mailer.estaConfigurado(), bloqueado: salidasBloqueadas()
  };
}

async function enviarFacturaPorCorreo(id, datos = {}, { exigirFiscal = false } = {}) {
  // Frenar antes de consultar o armar el PDF; mailer mantiene además su propia
  // guarda. Las pruebas sustituyen el transporte, nunca abren SMTP real.
  if (salidasBloqueadas()) throw errorSalidaBloqueada('enviar facturas por correo');
  const para = direccion(datos.para);
  const asunto = texto(datos.asunto, 'el asunto', 200, true);
  const mensaje = texto(datos.mensaje, 'el mensaje', 4000);
  const factura = await obtenerFactura(id);
  exigirEmitida(factura);
  // La entrega automática promete "el PDF con los dos XML": si la factura no
  // trae su comprobante aceptado, no sale un correo a medias con ese nombre.
  if (exigirFiscal && !factura.fiscal) throw httpError(409, 'La factura todavía no está aceptada por Hacienda.');
  if (!mailer.estaConfigurado()) {
    const error = httpError(503, 'El envío de correo todavía no está configurado.');
    error.code = 'CORREO_NO_CONFIGURADO';
    throw error;
  }
  const { rows } = await pool.query('SELECT * FROM empresa WHERE id = 1');
  const pdf = await generarPdfFactura(factura, rows[0] || null);
  const numeroArchivo = String(factura.numero || factura.id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
  const adjuntos=[{filename:`factura-${numeroArchivo}.pdf`,content:pdf,contentType:'application/pdf'}];
  if(factura.fiscal) {
    const fiscal=require('../../integrations/hacienda/emision.service').crearServicio(pool);
    for(const respuesta of [false,true])adjuntos.push({filename:`${respuesta?'respuesta-hacienda':'comprobante'}-${factura.fiscal.consecutivo}.xml`,content:Buffer.from(await fiscal.archivo(factura.fiscal.id,respuesta)),contentType:'application/xml'});
  }
  let resultado;
  try {
    resultado = await mailer.enviarCorreo({
      para, asunto, texto: mensaje,
      adjuntos
    });
  } catch {
    // Un error de nodemailer puede llevar servidor, usuario o credenciales.
    // No devolverlo ni registrarlo entero, ni reintentar un envío incierto.
    const error = httpError(502, 'No se pudo confirmar el envío. Revisá los enviados de la cuenta antes de reintentar.');
    error.code = 'CORREO_INCIERTO';
    throw error;
  }
  if (resultado?.rechazados?.length || !resultado?.aceptados?.some(v => typeof v === 'string' && v.toLowerCase() === para)) {
    const error = httpError(502, 'El servidor de correo no aceptó al destinatario. Revisá su dirección.');
    error.code = 'CORREO_RECHAZADO';
    throw error;
  }
  return { para, numero: factura.numero, aceptado: true };
}

/**
 * Entregarle al cliente su factura electrónica recién aceptada: el PDF, el
 * XML firmado y la respuesta de Hacienda.
 *
 * SE MANDA SOLA, y es la excepción a la regla de arriba ("una persona
 * confirma el destinatario"). El usuario lo pidió el 2026-10-11: «esta
 * factura se le tiene que enviar al cliente por correo el pdf con los 2 XML».
 * Entregar el comprobante es obligación de quien emite; dejarlo a un botón
 * aparte es dejarlo a la memoria de quien factura. Va al correo de la FICHA
 * del cliente, nunca a uno que venga en la petición.
 *
 * NO LANZA: la factura ya está aceptada y eso no depende del correo.
 * Devuelve qué pasó, para que quede anotado y se vea en la factura:
 *   { estado: 'enviado', para }
 *   { estado: 'sin_correo', motivo }   la ficha no tiene un correo válido
 *   { estado: 'error', para?, motivo } el servidor de correo no lo aceptó
 * No reintenta sola: un envío incierto repetido son dos correos al cliente.
 */
async function entregarFacturaElectronica(id) {
  let para = '';
  try {
    para = (await datosCorreoFactura(id)).para;
    if (!para) return { estado: 'sin_correo', motivo: 'El cliente no tiene un correo válido en su ficha.' };
    const factura = await obtenerFactura(id);
    const numero = factura.fiscal?.consecutivo || factura.numero;
    await enviarFacturaPorCorreo(id, {
      para,
      asunto: `Factura electrónica ${numero}`,
      mensaje: `Adjuntamos su factura electrónica ${numero}, aceptada por el Ministerio de Hacienda: ` +
        'el PDF, el comprobante XML y la respuesta de Hacienda.\n\nGracias por su compra.'
    }, { exigirFiscal: true });
    return { estado: 'enviado', para };
  } catch (e) {
    // Solo el texto de un error propio; el de nodemailer puede traer el
    // servidor o el usuario y ya se reemplaza más arriba.
    return { estado: 'error', ...(para ? { para } : {}), motivo: e?.status ? e.message : 'No se pudo enviar el correo al cliente.' };
  }
}

module.exports = { datosCorreoFactura, enviarFacturaPorCorreo, entregarFacturaElectronica };
