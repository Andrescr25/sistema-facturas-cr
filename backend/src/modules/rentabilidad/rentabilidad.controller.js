/**
 * Rentabilidad Module - Controller
 */

const servicio = require('./rentabilidad.service');

function responder(res, promesa, contexto) {
  return promesa
    .then((data) => res.json({ success: true, data }))
    .catch((error) => {
      const status = error.status || 500;
      if (status >= 500) console.error(`Error en Rentabilidad (${contexto}):`, error);
      res.status(status).json({ success: false, message: error.message });
    });
}

module.exports = {
  obtenerResumen: (req, res) => responder(res, servicio.obtenerResumen(), 'resumen'),
  listarProductos: (req, res) => responder(res, servicio.listarProductos(req.query), 'productos'),
  obtenerProducto: (req, res) => responder(res, servicio.obtenerProducto(req.params.alegraItemId), 'producto')
};
