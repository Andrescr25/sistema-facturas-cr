/**
 * Productos y categorías — Index (rama independencia-alegra)
 */

const { routes, rutasCompartidas } = require('./productos.routes');
const controller = require('./productos.controller');
const service = require('./productos.service');

module.exports = { routes, rutasCompartidas, controller, service };
