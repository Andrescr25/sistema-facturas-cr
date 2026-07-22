/**
 * Catalogo Publico Module - Index
 * Exporta todos los componentes del módulo de catálogo público (tablets)
 */

const catalogoPublicoRoutes = require('./catalogo-publico.routes');
const catalogoPublicoController = require('./catalogo-publico.controller');
const catalogoPublicoService = require('./catalogo-publico.service');

module.exports = {
  routes: catalogoPublicoRoutes,
  controller: catalogoPublicoController,
  service: catalogoPublicoService
};
