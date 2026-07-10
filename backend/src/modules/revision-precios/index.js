/**
 * Revision-Precios Module - Index
 * Exporta todos los componentes del módulo de revisión de precios
 */

const revisionPreciosRoutes = require('./revision-precios.routes');
const revisionPreciosController = require('./revision-precios.controller');
const revisionPreciosService = require('./revision-precios.service');

module.exports = {
  routes: revisionPreciosRoutes,
  controller: revisionPreciosController,
  service: revisionPreciosService
};
