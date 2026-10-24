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
router.get('/productos', reprintingController.buscarProductos);

// Historial. Solo se lee (2026-10-24, «que no se borre nada»): se quitaron
// «recuperar» una impresa y el DELETE que vaciaba `procesamientos`, que
// ninguna pantalla usaba y borraba el rastro de cada impresión.
router.get('/historial', reprintingController.getHistory);

module.exports = router;
