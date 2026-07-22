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

// Diagnóstico
router.get('/diagnostico/:alegraReference', missingItemsController.getDiagnostic);

// Asignación manual/reasignación de proveedores desde ReporteProveedores
router.post('/reasignar-proveedor', missingItemsController.assignSupplierManual);
router.post('/asignar-proveedor-manual', missingItemsController.assignSupplierManual);

module.exports = router;
