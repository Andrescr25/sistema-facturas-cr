/**
 * Warehouse Module - Index
 * Exporta todos los componentes del módulo de bodega/almacén
 */

const warehouseRoutes = require('./warehouse.routes');
const warehouseController = require('./warehouse.controller');
const bodegaPropia = require('./bodegaPropia');

module.exports = {
  routes: warehouseRoutes,
  controller: warehouseController,
  service: bodegaPropia
};
