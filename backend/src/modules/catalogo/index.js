/**
 * Catalogo Module - Index
 * Exporta todos los componentes del módulo de catálogo de productos
 */

const catalogoRoutes = require('./catalogo.routes');
const catalogoController = require('./catalogo.controller');
const catalogoService = require('./catalogo.service');

module.exports = {
  routes: catalogoRoutes,
  controller: catalogoController,
  service: catalogoService
};
