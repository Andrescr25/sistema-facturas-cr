module.exports = {
  routes: require('./cotizaciones.routes'),
  // Las rutas sin login van aparte: ver cotizaciones.publicas.routes.js.
  rutasPublicas: require('./cotizaciones.publicas.routes'),
  service: require('./cotizaciones.service')
};
