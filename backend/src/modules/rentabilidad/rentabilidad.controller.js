/**
 * Rentabilidad Module - Controller
 */

const rentabilidadService = require('./rentabilidad.service');
const competenciaService = require('./competencia.service');

async function obtenerResumen(req, res) {
  try {
    const data = await rentabilidadService.obtenerResumen();
    res.json(data);
  } catch (error) {
    console.error('Error obteniendo el resumen de rentabilidad:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
}

async function listarProductos(req, res) {
  try {
    const data = await rentabilidadService.listarProductos(req.query);
    res.json(data);
  } catch (error) {
    console.error('Error listando productos de rentabilidad:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
}

// ==================== Competencia (Fase 3) ====================

async function listarPendientesCompetencia(req, res) {
  try {
    const data = await competenciaService.listarPendientes();
    res.json({ sugerencias: data });
  } catch (error) {
    console.error('Error listando pendientes de competencia:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
}

async function listarConfirmadosCompetencia(req, res) {
  try {
    const data = await competenciaService.listarConfirmados();
    res.json({ mapeos: data });
  } catch (error) {
    console.error('Error listando mapeos de competencia:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
}

async function confirmarMatchCompetencia(req, res) {
  try {
    const data = await competenciaService.confirmarMatch(req.body);
    res.json(data);
  } catch (error) {
    console.error('Error confirmando match de competencia:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
}

async function rechazarMatchCompetencia(req, res) {
  try {
    const data = await competenciaService.rechazarMatch(req.body);
    res.json(data);
  } catch (error) {
    console.error('Error rechazando match de competencia:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
}

async function importarManualCompetencia(req, res) {
  try {
    const { fuente, filas } = req.body;
    const data = await competenciaService.importarListaManual(fuente, filas);
    res.json(data);
  } catch (error) {
    console.error('Error importando lista manual de competencia:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
}

async function sincronizarCompetencia(req, res) {
  try {
    const data = await competenciaService.sincronizarRapido(req.body);
    res.json(data);
  } catch (error) {
    console.error('Error sincronizando competencia:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
}

async function obtenerTendencia(req, res) {
  try {
    const data = await rentabilidadService.obtenerTendenciaMargenes({ categoria: req.query.categoria });
    res.json({ success: true, ...data });
  } catch (error) {
    console.error('❌ Error obteniendo la tendencia de márgenes:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function obtenerDeterioro(req, res) {
  try {
    const data = await rentabilidadService.obtenerDeterioroMargenes({ limite: Number(req.query.limite) || 20 });
    res.json({ success: true, ...data });
  } catch (error) {
    console.error('❌ Error obteniendo el deterioro de márgenes:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function tomarSnapshot(req, res) {
  try {
    const data = await rentabilidadService.tomarSnapshotMargenes();
    res.json({ success: true, ...data });
  } catch (error) {
    console.error('❌ Error tomando el snapshot de márgenes:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  obtenerResumen,
  obtenerTendencia,
  obtenerDeterioro,
  tomarSnapshot,
  listarProductos,
  listarPendientesCompetencia,
  listarConfirmadosCompetencia,
  confirmarMatchCompetencia,
  rechazarMatchCompetencia,
  importarManualCompetencia,
  sincronizarCompetencia
};
