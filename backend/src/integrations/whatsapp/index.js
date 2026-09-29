/**
 * Integración con WhatsApp.
 *
 * Mandar (texto o PDF) pasa por whatsapp.client.js, que elige el canal: el de
 * adentro (conexion.js, Baileys en este servidor) o Evolution API. La
 * conexión de adentro se enciende y se apaga con el servidor (server.js) y se
 * vincula desde Configuración.
 */
const cliente = require('./whatsapp.client');
const conexion = require('./conexion');

module.exports = {
  ...cliente,
  iniciar: conexion.iniciar,
  detener: conexion.detener,
  estado: conexion.estado,
  vincular: conexion.vincular,
  desvincular: conexion.desvincular
};
