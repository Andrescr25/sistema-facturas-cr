/**
 * Configuración de la empresa — Controller
 */

const servicio = require('./configuracion.service');

function responderError(res, error, contexto) {
  const status = error.status || 500;
  if (status >= 500) console.error(`❌ Configuración (${contexto}):`, error);
  res.status(status).json({ success: false, message: error.message, error: error.message });
}

/** GET /configuracion — todo, incluido lo inactivo. */
async function obtener(req, res) {
  try {
    res.json({ success: true, data: await servicio.obtenerConfiguracion() });
  } catch (error) {
    responderError(res, error, 'obtener');
  }
}

/** PUT /configuracion/empresa */
async function actualizarEmpresa(req, res) {
  try {
    res.json({ success: true, data: await servicio.actualizarEmpresa(req.body, req.usuario?.id) });
  } catch (error) {
    responderError(res, error, 'empresa');
  }
}

/** POST /configuracion/:catalogo */
async function crear(req, res) {
  try {
    const data = await servicio.crearEnCatalogo(req.params.catalogo, req.body, req.usuario?.id);
    res.status(201).json({ success: true, data });
  } catch (error) {
    responderError(res, error, `crear ${req.params.catalogo}`);
  }
}

/** PUT /configuracion/:catalogo/:id */
async function editar(req, res) {
  try {
    const data = await servicio.editarEnCatalogo(req.params.catalogo, req.params.id, req.body, req.usuario?.id);
    res.json({ success: true, data });
  } catch (error) {
    responderError(res, error, `editar ${req.params.catalogo}`);
  }
}

/** PATCH /configuracion/:catalogo/:id/activo  { activo: true|false } */
async function cambiarActivo(req, res) {
  try {
    const data = await servicio.cambiarActivo(req.params.catalogo, req.params.id, req.body?.activo, req.usuario?.id);
    res.json({ success: true, data });
  } catch (error) {
    responderError(res, error, `activo ${req.params.catalogo}`);
  }
}

/** GET /catalogos/configuracion — lo activo, para operar. */
async function paraOperar(req, res) {
  try {
    res.json({ success: true, data: await servicio.catalogosParaOperar() });
  } catch (error) {
    responderError(res, error, 'para operar');
  }
}

module.exports = { obtener, actualizarEmpresa, crear, editar, cambiarActivo, paraOperar };
