/**
 * Catalogo Publico Module - Index
 * Exporta todos los componentes del módulo de catálogo público (tablets)
 */

const catalogoAgenteRoutes = require('./catalogo-agente.routes');
const catalogoAgenteController = require('./catalogo-agente.controller');
const catalogoAgenteService = require('./catalogo-agente.service');

module.exports = {
  routes: catalogoAgenteRoutes,
  controller: catalogoAgenteController,
  service: catalogoAgenteService
};
