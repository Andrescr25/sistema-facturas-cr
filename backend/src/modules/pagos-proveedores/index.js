/**
 * Pagos-Proveedores Module - Index
 * Exporta todos los componentes del módulo de cuentas por pagar
 */

const pagosProveedoresRoutes = require('./pagos-proveedores.routes');
const pagosProveedoresController = require('./pagos-proveedores.controller');

module.exports = {
  routes: pagosProveedoresRoutes,
  controller: pagosProveedoresController
};
