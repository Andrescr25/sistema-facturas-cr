/**
 * Rutas del módulo de Reportes
 */

const express = require('express');
const ReportController = require('./report.controller');

const router = express.Router();
const reportController = new ReportController();

// Reporte de faltantes por proveedor
router.get('/faltantes/proveedor', reportController.getMissingItemsBySupplier);

// Las notas escritas al facturar, para leerlas al comprar
router.get('/faltantes/notas', reportController.getNotasDeFaltantes);

// Reporte de faltantes por cliente
router.get('/faltantes/cliente', reportController.getMissingItemsByClient);

// Limpiar faltantes procesados
router.delete('/faltantes/proveedor/limpiar', reportController.clearProcessedSupplierMissingItems);

// Encargos especiales
router.get('/encargos-especiales', reportController.getEncargosEspeciales);

// Reporte consolidado de faltantes
router.get('/faltantes/consolidado', reportController.getMissingItemsConsolidated);

// Reporte de compras sugeridas por proveedor
router.get('/compras/sugeridas', reportController.getSuggestedPurchases);

// Historial de procesamientos
router.get('/historial', reportController.getProcessingHistory);

module.exports = router;
