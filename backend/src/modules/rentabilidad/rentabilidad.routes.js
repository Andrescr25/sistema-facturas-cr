/**
 * Rentabilidad Module - Routes
 * Tablero de rentabilidad (montado en /api/rentabilidad)
 */

const express = require('express');
const router = express.Router();
const rentabilidadController = require('./rentabilidad.controller');

router.get('/resumen', rentabilidadController.obtenerResumen);
router.get('/productos', rentabilidadController.listarProductos);

// Monitoreo de márgenes: la serie histórica y qué se deterioró.
router.get('/tendencia', rentabilidadController.obtenerTendencia);
router.get('/deterioro', rentabilidadController.obtenerDeterioro);
router.post('/snapshot', rentabilidadController.tomarSnapshot);

// Competencia (Fase 3)
router.get('/competencia/pendientes', rentabilidadController.listarPendientesCompetencia);
router.get('/competencia/confirmados', rentabilidadController.listarConfirmadosCompetencia);
router.post('/competencia/confirmar', rentabilidadController.confirmarMatchCompetencia);
router.post('/competencia/rechazar', rentabilidadController.rechazarMatchCompetencia);
router.post('/competencia/importar-manual', rentabilidadController.importarManualCompetencia);
router.post('/competencia/sincronizar', rentabilidadController.sincronizarCompetencia);

module.exports = router;
