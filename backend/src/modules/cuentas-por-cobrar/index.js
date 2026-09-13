/**
 * Cuentas por Cobrar Module - Index
 */

const routes = require('./cuentas-por-cobrar.routes');
const controller = require('./cobros.controller');
const service = require('./cobros.service');

module.exports = {
  routes,
  controller,
  service
};
