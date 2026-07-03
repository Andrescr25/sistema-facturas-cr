/**
 * Rutas del módulo de Facturas
 * Define todos los endpoints relacionados con facturas
 */

const express = require('express');
const InvoiceController = require('./invoice.controller');

const router = express.Router();
const invoiceController = new InvoiceController();

// ===== BASE Y CREACIÓN LOCAL =====
router.get('/', invoiceController.getInvoices);
router.post('/', invoiceController.createInvoiceLocal);

// ===== BÚSQUEDA =====
router.get('/buscar/numero/:numero', invoiceController.searchByNumber);
router.get('/buscar/cliente/:cliente', invoiceController.searchByClient);
router.get('/buscar/:termino', invoiceController.searchInvoicesLocal);

// ===== CONSECUTIVOS =====
router.get('/siguiente-consecutivo', invoiceController.getNextConsecutive);

// ===== PDF =====
router.get('/:id/pdf', invoiceController.getInvoicePDF);
router.get('/:id/pdf/download', invoiceController.downloadInvoicePDFBinary);

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

// ===== OPERACIONES LOCALES (Parámetros comodín al final) =====
router.get('/:id', invoiceController.getInvoiceWithRelations);
router.put('/:id', invoiceController.updateInvoiceLocal);
router.patch('/:id/procesada', invoiceController.markAsProcessedLocal);

module.exports = router;
