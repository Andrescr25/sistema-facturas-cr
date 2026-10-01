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

// ===== PERÍODOS =====
router.get('/:ano/:mes/todas', invoiceController.getInvoicesByPeriod);
router.get('/:ano/:mes/:semana', invoiceController.getInvoicesByPeriod);

// ===== REIMPRESIÓN Y FALTANTES =====
// Se retiraron el 2026-09-30 (sección 11 del checklist), todas por id de
// Alegra: /pendientes-reimpresion, /procesadas-reimpresion, /detalle/:id,
// /procesar-individual, /:id/recuperar y POST /:id/faltantes. Bodega, el
// Reporte de Clientes e Impresión trabajan sobre la factura propia
// (/bodega/facturas-propias, /reportes/faltantes/cliente/facturas,
// /reimpresion/facturas).

// ===== OPERACIONES LOCALES (Parámetros comodín al final) =====
router.get('/:id', invoiceController.getInvoiceWithRelations);
router.put('/:id', invoiceController.updateInvoiceLocal);
router.patch('/:id/procesada', invoiceController.markAsProcessedLocal);

module.exports = router;
