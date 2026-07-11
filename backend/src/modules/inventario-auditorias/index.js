/**
 * Inventario-Auditorias Module - Index
 * Exporta todos los componentes del módulo de auditorías de inventario
 */

const inventarioAuditoriasRoutes = require('./inventario-auditorias.routes');
const inventarioAuditoriasController = require('./inventario-auditorias.controller');
const inventarioAuditoriasService = require('./inventario-auditorias.service');

module.exports = {
  routes: inventarioAuditoriasRoutes,
  controller: inventarioAuditoriasController,
  service: inventarioAuditoriasService
};
