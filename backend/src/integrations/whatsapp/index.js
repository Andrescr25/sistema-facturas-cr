/**
 * Integración con WhatsApp (Evolution API).
 *
 * Toda la conversación con Evolution pasa por acá: enviar texto, enviar un
 * documento y traducir sus errores a algo accionable.
 */
const cliente = require('./whatsapp.client');

module.exports = cliente;
