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

// Una factura PROPIA de la cola, por su id (`factura.id`). Van después de
// /pendientes y /procesadas para que ':facturaId' no se las trague.
router.get('/facturas/:facturaId', reprintingController.detalleFacturaPropia);
router.get('/facturas/:facturaId/pdf', reprintingController.pdfFacturaPropia);
router.post('/facturas/:facturaId/procesar', reprintingController.procesarFacturaPropia);
router.post('/facturas/:facturaId/recuperar', reprintingController.recuperarFacturaPropia);
router.get('/productos', reprintingController.buscarProductos);

// Historial
router.get('/historial', reprintingController.getHistory);
router.delete('/historial', reprintingController.clearHistory);

module.exports = router;
