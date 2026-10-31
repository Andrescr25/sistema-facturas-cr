/**
 * Auth - Controller
 */

const service = require('./auth.service');
const usuariosService = require('../usuarios/usuarios.service');

async function login(req, res) {
  try {
    const data = await service.login(req.body || {});
    res.json({ success: true, data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error('Error en login:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/auth/estado — pública. Solo dice si ya hay algún usuario creado,
 * para que el frontend sepa si mostrar la pantalla de ingreso o la de alta
 * del primer usuario. No devuelve nombres ni cantidad.
 */
async function estado(req, res) {
  try {
    res.json({ success: true, data: { configurado: await service.hayUsuarios() } });
  } catch (error) {
    console.error('Error consultando el estado de auth:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/auth/yo — quién es el token que vino, y qué módulos ve. Sirve para
 * revalidar la sesión al recargar la página sin volver a pedir la contraseña.
 *
 * Los permisos salen de la BASE en cada llamada, no del token: si alguien le
 * quita un módulo a un usuario, el cambio pega en cuanto recarga, sin esperar
 * a que le venza el token (12 horas). El frontend usa esto para armar el
 * menú; la autorización de verdad la hace requirePermiso en el backend.
 */
async function yo(req, res) {
  try {
    const permisos = await usuariosService.permisosDe(req.usuario.id);

    // El usuario se borró o se desactivó después de que le dieron el token.
    if (!permisos) {
      return res.status(401).json({
        success: false, error: 'Su cuenta ya no está activa.', code: 'CUENTA_INACTIVA'
      });
    }

    res.json({
      success: true,
      data: { ...req.usuario, esAdmin: permisos.esAdmin, modulos: [...permisos.modulos], modulosOcultos: permisos.modulosOcultos || [] }
    });
  } catch (error) {
    console.error('Error resolviendo la sesión:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function crearUsuario(req, res) {
  try {
    const data = await service.crearUsuario(req.body || {});
    res.json({ success: true, data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error('Error creando usuario:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function cambiarPassword(req, res) {
  try {
    const data = await service.cambiarPassword(req.usuario.id, req.body || {});
    res.json({ success: true, data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error('Error cambiando contraseña:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = { login, estado, yo, crearUsuario, cambiarPassword };
