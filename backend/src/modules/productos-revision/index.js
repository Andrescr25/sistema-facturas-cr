/**
 * Productos-Revision Module - Index
 * Exporta todos los componentes del módulo de relaciones producto-proveedor
 */

const productosRevisionRoutes = require('./productos-revision.routes');
const productosRevisionController = require('./productos-revision.controller');
const productosRevisionService = require('./productos-revision.service');

module.exports = {
  routes: productosRevisionRoutes,
  controller: productosRevisionController,
  service: productosRevisionService
};
