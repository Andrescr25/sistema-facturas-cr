/**
 * Rutas del módulo de Reportes
 */

const express = require('express');
const ReportController = require('./report.controller');

const router = express.Router();
const reportController = new ReportController();

// Reporte de faltantes por proveedor
router.get('/faltantes/proveedor', reportController.getMissingItemsBySupplier);

// Reporte de faltantes por cliente
router.get('/faltantes/cliente', reportController.getMissingItemsByClient);

// Limpiar faltantes procesados
router.delete('/faltantes/proveedor/limpiar', reportController.clearProcessedSupplierMissingItems);

// Encargos especiales
router.get('/encargos-especiales', reportController.getEncargosEspeciales);

// Historial de procesamientos
router.get('/historial', reportController.getProcessingHistory);

module.exports = router;
