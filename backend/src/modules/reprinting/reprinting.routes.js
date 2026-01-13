/**
 * Reprinting Module - Routes
 * Rutas para operaciones de reimpresión
 */

const express = require('express');
const router = express.Router();
const reprintingController = require('./reprinting.controller');

// Facturas pendientes y procesadas
router.get('/facturas/pendientes', reprintingController.getPendingInvoices);
router.get('/facturas/procesadas', reprintingController.getProcessedInvoices);

// Historial
router.get('/historial', reprintingController.getHistory);
router.delete('/historial', reprintingController.clearHistory);

module.exports = router;
