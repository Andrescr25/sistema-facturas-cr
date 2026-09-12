/**
 * Proveedores — maestro propio (Controller)
 *
 * Va aparte del controller viejo de este módulo, que responde el reporte de
 * compras derivado de las facturas del buzón y tiene otra forma de respuesta.
 */

const servicio = require('./proveedores.maestro.service');

function responder(res, promesa, contexto, status = 200) {
  return promesa
    .then(data => res.status(status).json({ success: true, data }))
    .catch(error => {
      const s = error.status || 500;
      if (s >= 500) console.error(`❌ Proveedores · fichas (${contexto}):`, error);
      res.status(s).json({ success: false, message: error.message, error: error.message });
    });
}

const usuario = (req) => req.usuario?.id;

module.exports = {
  /** GET /proveedores/fichas?buscar=&estado=&pagina=&limite= */
  listar: (req, res) => servicio.listarFichas(req.query)
    .then(r => res.json({ success: true, ...r }))
    .catch(error => res.status(error.status || 500).json({ success: false, message: error.message, error: error.message })),
  obtener: (req, res) => responder(res, servicio.obtenerFicha(req.params.id), 'obtener'),
  crear: (req, res) => responder(res, servicio.crearFicha(req.body, usuario(req)), 'crear', 201),
  editar: (req, res) => responder(res, servicio.editarFicha(req.params.id, req.body, usuario(req)), 'editar'),
  cambiarEstado: (req, res) => responder(res, servicio.cambiarEstadoFicha(req.params.id, req.body?.activo, usuario(req)), 'estado')
};
