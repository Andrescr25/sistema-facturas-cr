/**
 * Missing-Items Module - Index
 * Exporta todos los componentes del módulo de faltantes
 */

const missingItemsRoutes = require('./missing-items.routes');
const missingItemsController = require('./missing-items.controller');
const missingItemsService = require('./missing-items.service');

module.exports = {
  routes: missingItemsRoutes,
  controller: missingItemsController,
  service: missingItemsService
};
