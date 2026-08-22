const routes = require('./usuarios.routes');
const service = require('./usuarios.service');
const modulos = require('./modulos');
const { requirePermiso } = require('./permisos.middleware');

module.exports = { routes, service, modulos, requirePermiso };
