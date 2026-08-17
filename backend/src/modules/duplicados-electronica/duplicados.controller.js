/**
 * Duplicados por conversión a electrónica - Controller
 */

const service = require('./duplicados.service');

/**
 * POST /api/duplicados-electronica/revisar
 * Corre la detección. `soloDetectar: true` no toca Alegra.
 */
async function revisar(req, res) {
  try {
    const data = await service.revisarDuplicados({
      dias: req.body?.dias,
      soloDetectar: req.body?.soloDetectar === true
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error revisando duplicados de electrónica:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/duplicados-electronica/pendientes
 */
async function pendientes(req, res) {
  try {
    res.json({ success: true, data: await service.listarPendientes() });
  } catch (error) {
    console.error('Error listando duplicados pendientes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/duplicados-electronica/anulados
 */
async function anulados(req, res) {
  try {
    res.json({ success: true, data: await service.listarAnulados() });
  } catch (error) {
    console.error('Error listando duplicados anulados:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST /api/duplicados-electronica/:duplicadoId/anular
 */
async function anular(req, res) {
  try {
    const data = await service.anularManual(req.params.duplicadoId);
    res.json({ success: true, data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error('Error anulando el duplicado:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = { revisar, pendientes, anulados, anular };
