/**
 * Usuarios y permisos - Controller
 */

const service = require('./usuarios.service');
const { porGrupo } = require('./modulos');

async function responder(res, promesa, mensajeError) {
  try {
    res.json({ success: true, data: await promesa });
  } catch (error) {
    const status = error.status || 500;
    if (status === 500) console.error(`${mensajeError}:`, error.message);
    res.status(status).json({ success: false, message: error.message, error: error.message });
  }
}

const catalogoModulos = (req, res) => res.json({ success: true, data: porGrupo() });

const listar = (req, res) => responder(res, service.listar(), 'Error listando usuarios');

const obtener = (req, res) =>
  responder(res, service.obtener(req.params.id), 'Error obteniendo el usuario');

const crear = (req, res) =>
  responder(res, service.crear(req.body, req.usuario.id), 'Error creando el usuario');

const actualizar = (req, res) =>
  responder(res, service.actualizar(req.params.id, req.body, req.usuario.id), 'Error actualizando el usuario');

const restablecerPassword = (req, res) =>
  responder(res, service.restablecerPassword(req.params.id, req.body), 'Error restableciendo la contraseña');

const eliminar = (req, res) =>
  responder(res, service.eliminar(req.params.id, req.usuario.id), 'Error eliminando el usuario');

module.exports = {
  catalogoModulos, listar, obtener, crear, actualizar, restablecerPassword, eliminar
};
