/**
 * Reprinting Module - Index
 * Exporta todos los componentes del módulo de reimpresión
 */

const reprintingRoutes = require('./reprinting.routes');
const reprintingController = require('./reprinting.controller');
const reprintingService = require('./reprinting.service');

module.exports = {
  routes: reprintingRoutes,
  controller: reprintingController,
  service: reprintingService
};
