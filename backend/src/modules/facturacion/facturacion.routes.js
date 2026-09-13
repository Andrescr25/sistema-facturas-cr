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
const notaCredito = require('./notaCredito.controller');

const router = express.Router();
const controller = new FacturacionController();

// ---- Factura propia, sin Alegra ----
router.get('/facturas', facturaPropia.listar);
router.get('/facturas/:id', facturaPropia.ver);
// El PDF propio: es lo que permite entregar la venta impresa sin Alegra.
router.get('/facturas/:id/pdf', facturaPropia.pdf);
// Mandarle la factura al cliente con NUESTRO PDF. El archivo se adjunta; no
// se manda un enlace, que tendría que ser público y la factura lleva la
// cédula y la dirección del cliente.
router.get('/facturas/:id/telefonos', facturaPropia.telefonos);
router.post('/facturas/:id/whatsapp', facturaPropia.whatsapp);
router.post('/facturas', facturaPropia.crear);
router.put('/facturas/:id', facturaPropia.editar);
// Anular NO borra: la factura conserva su número y queda con su motivo. Un
// número que desaparece es un hueco que después hay que explicarle a Hacienda.
router.patch('/facturas/:id/anular', facturaPropia.anular);

// ---- Notas de crédito propias ----
// Deshacen una venta ya entregada SIN borrar la factura: el número se conserva
// y la nota dice qué se devuelve y por qué.
router.get('/notas-credito/motivos', notaCredito.motivos);
router.post('/notas-credito', notaCredito.crear);
router.patch('/notas-credito/:id/anular', notaCredito.anular);

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
