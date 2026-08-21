/**
 * Auth - Controller
 */

const service = require('./auth.service');

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
 * GET /api/auth/yo — quién es el token que vino. Sirve para revalidar la
 * sesión al recargar la página sin volver a pedir la contraseña.
 */
async function yo(req, res) {
  res.json({ success: true, data: req.usuario });
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
