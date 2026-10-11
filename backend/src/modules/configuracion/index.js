/**
 * Configuración de la empresa — Index (rama independencia-alegra)
 */

const { routes, rutasCompartidas } = require('./configuracion.routes');
const controller = require('./configuracion.controller');
const service = require('./configuracion.service');

module.exports = { routes, rutasCompartidas, controller, service };
