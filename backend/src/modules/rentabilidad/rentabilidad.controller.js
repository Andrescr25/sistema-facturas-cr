/**
 * Rentabilidad Module - Controller
 */

const servicio = require('./rentabilidad.service');
const excel = require('./rentabilidad.excel');
const { enviarExcel } = require('../../utils/exportarExcel');

async function descargar(res, promesa) {
  try { return enviarExcel(res, await promesa); }
  catch (error) { res.status(error.status || 500).json({ success: false, message: error.message }); }
}

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
  exportar: (req, res) => descargar(res, excel.exportar(req.query)),
  exportarProducto: (req, res) => descargar(res, excel.exportarProducto(req.params.productoId)),
  obtenerResumen: (req, res) => responder(res, servicio.obtenerResumen(), 'resumen'),
  listarProductos: (req, res) => responder(res, servicio.listarProductos(req.query), 'productos'),
  obtenerProducto: (req, res) => responder(res, servicio.obtenerProducto(req.params.productoId), 'producto')
};
