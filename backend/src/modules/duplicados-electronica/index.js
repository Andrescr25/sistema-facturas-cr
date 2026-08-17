/**
 * Duplicados por conversión a electrónica - Index
 */

const routes = require('./duplicados.routes');
const controller = require('./duplicados.controller');
const service = require('./duplicados.service');
const detector = require('./duplicados.detector');

module.exports = {
  routes,
  controller,
  service,
  detector
};
