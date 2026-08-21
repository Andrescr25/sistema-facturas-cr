/**
 * Auth Module - Index
 */

const routes = require('./auth.routes');
const controller = require('./auth.controller');
const service = require('./auth.service');
const middleware = require('./auth.middleware');

module.exports = { routes, controller, service, middleware };
