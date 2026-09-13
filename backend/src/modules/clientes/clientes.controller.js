/**
 * Clientes — Controller
 */

const servicio = require('./clientes.service');

function responder(res, promesa, contexto, status = 200) {
  return promesa
    .then(data => res.status(status).json({ success: true, data }))
    .catch(error => {
      const s = error.status || 500;
      if (s >= 500) console.error(`❌ Clientes (${contexto}):`, error);
      res.status(s).json({ success: false, message: error.message, error: error.message });
    });
}

const conPaginacion = (res, promesa) => promesa
  .then(r => res.json({ success: true, ...r }))
  .catch(error => res.status(error.status || 500).json({ success: false, message: error.message, error: error.message }));

const usuario = (req) => req.usuario?.id;

module.exports = {
  /** GET /clientes?buscar=&estado=&conCredito=&pagina=&limite= */
  listar: (req, res) => conPaginacion(res, servicio.listarClientes(req.query)),
  obtener: (req, res) => responder(res, servicio.obtenerCliente(req.params.id), 'obtener'),

  /**
   * GET /clientes/coincidencias?identificacion=&excepto=
   * Con qué otras fichas choca esa identificación. Avisa, no bloquea: el
   * número del cliente de mostrador lo comparten 139 fichas a propósito.
   */
  coincidencias: (req, res) => responder(
    res, servicio.fichasConIdentificacion(req.query.identificacion, req.query.excepto || null), 'coincidencias'),
  crear: (req, res) => responder(res, servicio.crearCliente(req.body, usuario(req)), 'crear', 201),
  editar: (req, res) => responder(res, servicio.editarCliente(req.params.id, req.body, usuario(req)), 'editar'),
  cambiarEstado: (req, res) => responder(res, servicio.cambiarEstadoCliente(req.params.id, req.body?.activo, usuario(req)), 'estado'),

  /** GET /catalogos/clientes — para facturar y cobrar: activos y lo justo. */
  paraOperar: (req, res) => conPaginacion(res, servicio.clientesParaOperar(req.query))
};
