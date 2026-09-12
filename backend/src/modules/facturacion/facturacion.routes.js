/**
 * Facturacion Module - Routes
 *
 * Conviven dos caminos, a propósito:
 *
 * - `/facturas`: la factura PROPIA, que nace en nuestra base con su número de
 *   la serie propia y no manda nada a Alegra (rama independencia-alegra).
 * - `/invoices` y las demás: las de siempre, contra Alegra.
 *
 * Las viejas no se apagan todavía: dejar a la empresa sin poder facturar
 * porque la pantalla aún no llama a la ruta nueva sería peor que tener las dos
 * un tiempo. Se retiran cuando Facturación use `/facturas` (sección 6 del
 * checklist).
 */

const express = require('express');
const FacturacionController = require('./facturacion.controller');
const facturaPropia = require('./facturaPropia.controller');

const router = express.Router();
const controller = new FacturacionController();

// ---- Factura propia, sin Alegra ----
router.post('/facturas', facturaPropia.crear);

// ---- Contra Alegra (lo de siempre) ----
router.get('/items', controller.getItems);
router.get('/contacts', controller.getContacts);
router.post('/invoices', controller.createInvoice);
router.get('/invoices/:id/pdf', controller.getInvoicePDF);
// Mandarle la factura al cliente por WhatsApp, con el PDF adjunto.
router.post('/invoices/:id/whatsapp', controller.enviarFacturaWhatsApp);
router.get('/taxes', controller.getTaxes);
router.get('/payment-methods', controller.getPaymentMethods);

module.exports = router;
