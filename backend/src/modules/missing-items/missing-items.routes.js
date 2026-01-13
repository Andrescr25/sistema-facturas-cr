/**
 * Missing-Items Module - Routes
 * Rutas para operaciones de faltantes
 */

const express = require('express');
const router = express.Router();
const missingItemsController = require('./missing-items.controller');

// Ajustes de faltantes
router.post('/ajustes', missingItemsController.saveAdjustment);
router.delete('/ajustes/:faltanteId', missingItemsController.deleteAdjustment);

// Limpieza
router.delete('/proveedor/limpiar', missingItemsController.cleanProviderMissingItems);

// Diagnóstico y mantenimiento
router.get('/diagnostico/:alegraReference', missingItemsController.getDiagnostic);
router.post('/limpiar-duplicados/:alegraReference', missingItemsController.cleanDuplicates);

module.exports = router;
