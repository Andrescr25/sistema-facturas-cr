/**
 * Faltantes Module - Index
 * Exporta todos los componentes del módulo de registro de faltantes
 */

const faltantesRoutes = require('./faltantes.routes');
const faltantesController = require('./faltantes.controller');
const faltantesService = require('./faltantes.service');

module.exports = {
  routes: faltantesRoutes,
  controller: faltantesController,
  service: faltantesService
};
