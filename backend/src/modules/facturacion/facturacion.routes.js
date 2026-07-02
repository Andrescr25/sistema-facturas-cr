/**
 * Facturacion Module - Routes
 * Mapeo de rutas para operaciones de facturación rápida
 */

const express = require('express');
const FacturacionController = require('./facturacion.controller');

const router = express.Router();
const controller = new FacturacionController();

router.get('/items', controller.getItems);
router.get('/contacts', controller.getContacts);
router.post('/invoices', controller.createInvoice);
router.get('/invoices/:id/pdf', controller.getInvoicePDF);
router.get('/taxes', controller.getTaxes);
router.get('/payment-methods', controller.getPaymentMethods);

module.exports = router;
