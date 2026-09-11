/**
 * Envío de correo (SMTP).
 *
 * Reutiliza por defecto las credenciales de IMAP: son la misma cuenta de
 * Gmail y la misma contraseña de aplicación sirve para leer y para enviar.
 * Se dejan variables SMTP_* aparte por si algún día el envío sale por otra
 * cuenta, pero no hay que configurarlas para que esto funcione.
 */

const nodemailer = require('nodemailer');
const { salidasBloqueadas, errorSalidaBloqueada } = require('../config/aislado');

function configuracion() {
  const host = process.env.SMTP_HOST || (process.env.IMAP_HOST || '').replace('imap.', 'smtp.');
  const user = process.env.SMTP_USER || process.env.IMAP_USER;
  const password = process.env.SMTP_PASSWORD || process.env.IMAP_PASSWORD;
  // 465 = SSL directo, que es lo que acepta Gmail sin STARTTLS.
  const port = Number(process.env.SMTP_PORT) || 465;
  return { host, port, user, password, secure: port === 465 };
}

/** true si hay credenciales suficientes para intentar un envío. */
function estaConfigurado() {
  const { host, user, password } = configuracion();
  return Boolean(host && user && password);
}

let transporteCache = null;

function obtenerTransporte() {
  const { host, port, user, password, secure } = configuracion();
  if (!host || !user || !password) {
    const error = new Error('El envío de correo no está configurado (faltan IMAP_USER / IMAP_PASSWORD o sus equivalentes SMTP_*).');
    error.status = 503;
    throw error;
  }
  if (!transporteCache) {
    transporteCache = nodemailer.createTransport({ host, port, secure, auth: { user, pass: password } });
  }
  return transporteCache;
}

/**
 * @param {{para: string, asunto: string, texto: string, html?: string,
 *          adjuntos?: Array<{filename: string, content: Buffer}>}} mensaje
 */
async function enviarCorreo({ para, asunto, texto, html, adjuntos = [] }) {
  // Rama aislada: el contador y los clientes no reciben correos de pruebas.
  if (salidasBloqueadas()) throw errorSalidaBloqueada('enviar correos');
  const { user } = configuracion();
  const transporte = obtenerTransporte();
  const info = await transporte.sendMail({
    from: user,
    to: para,
    subject: asunto,
    text: texto,
    html,
    attachments: adjuntos
  });
  return { messageId: info.messageId, aceptados: info.accepted || [], rechazados: info.rejected || [] };
}

module.exports = { enviarCorreo, estaConfigurado, remitente: () => configuracion().user };
