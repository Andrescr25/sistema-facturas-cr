/**
 * Rentabilidad Module - Index
 */

const rentabilidadRoutes = require('./rentabilidad.routes');
const rentabilidadController = require('./rentabilidad.controller');
const rentabilidadService = require('./rentabilidad.service');

module.exports = {
  routes: rentabilidadRoutes,
  controller: rentabilidadController,
  service: rentabilidadService
};
