/**
 * Proveedores Module - Index
 * Exporta todos los componentes del módulo de proveedores
 */

const proveedoresRoutes = require('./proveedores.routes');
const proveedoresController = require('./proveedores.controller');
const proveedoresService = require('./proveedores.service');

module.exports = {
  routes: proveedoresRoutes,
  controller: proveedoresController,
  service: proveedoresService
};
