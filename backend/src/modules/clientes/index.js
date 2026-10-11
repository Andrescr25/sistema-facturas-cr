/**
 * Clientes — Index (rama independencia-alegra)
 */

const { routes, rutasCompartidas } = require('./clientes.routes');
const controller = require('./clientes.controller');
const service = require('./clientes.service');
const desdeAlegra = require('./desdeAlegra');

module.exports = { routes, rutasCompartidas, controller, service, desdeAlegra };
