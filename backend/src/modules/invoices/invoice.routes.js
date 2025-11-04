/**
 * Rutas del módulo de Facturas
 * Define todos los endpoints relacionados con facturas
 */

const express = require('express');
const InvoiceController = require('./invoice.controller');

const router = express.Router();
const invoiceController = new InvoiceController();

// ===== BÚSQUEDA =====
router.get('/buscar/numero/:numero', invoiceController.searchByNumber);
router.get('/buscar/cliente/:cliente', invoiceController.searchByClient);

// ===== CONSECUTIVOS =====
router.get('/siguiente-consecutivo', invoiceController.getNextConsecutive);

// ===== PDF =====
router.get('/:id/pdf', invoiceController.getInvoicePDF);

// ===== PERÍODOS =====
router.get('/:ano/:mes/todas', invoiceController.getInvoicesByPeriod);
router.get('/:ano/:mes/:semana', invoiceController.getInvoicesByPeriod);

// ===== REIMPRESIÓN =====
router.get('/pendientes-reimpresion', invoiceController.getPendingReprintInvoices);
router.get('/procesadas-reimpresion', invoiceController.getProcessedReprintInvoices);

// ===== DETALLE =====
router.get('/detalle/:id', invoiceController.getInvoiceDetail);

// ===== PROCESAMIENTO =====
router.post('/procesar-individual', invoiceController.processIndividualInvoice);
router.post('/:id/recuperar', invoiceController.recoverProcessedInvoice);

// ===== FALTANTES =====
router.post('/:id/faltantes', invoiceController.registerMissingItems);

module.exports = router;
