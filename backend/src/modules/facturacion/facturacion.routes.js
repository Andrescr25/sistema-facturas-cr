/**
 * Facturacion Module - Routes
 *
 * Un solo camino: la factura PROPIA, que nace en nuestra base con su número
 * de la serie propia y no manda nada a Alegra.
 *
 * Las rutas de siempre contra Alegra (`/items`, `/contacts`, `/invoices`,
 * `/invoices/:id/pdf`, `/invoices/:id/whatsapp`, `/taxes`,
 * `/payment-methods`) se retiraron el 2026-10-04: la pantalla ya crea, edita,
 * imprime y manda por `/facturas`, y no quedaba nadie que las llamara. Con
 * ellas se fue lo único que todavía podía crear una factura en Alegra desde
 * este sistema.
 */

const express = require('express');
const facturaPropia = require('./facturaPropia.controller');
const notaCredito = require('./notaCredito.controller');

const router = express.Router();

// Los descuentos de exceso que el cliente ya ve en el catálogo y el portal.
router.get('/ofertas', facturaPropia.ofertas);
router.get('/facturas', facturaPropia.listar);
router.get('/facturas/:id', facturaPropia.ver);
// El PDF propio: es lo que permite entregar la venta impresa sin Alegra.
router.get('/facturas/:id/pdf', facturaPropia.pdf);
// Mandarle la factura al cliente con NUESTRO PDF. El archivo se adjunta; no
// se manda un enlace, que tendría que ser público y la factura lleva la
// cédula y la dirección del cliente.
router.get('/facturas/:id/telefonos', facturaPropia.telefonos);
router.post('/facturas/:id/whatsapp', facturaPropia.whatsapp);
// El correo confirma un destinatario y adjunta el mismo PDF propio.
router.get('/facturas/:id/correo', facturaPropia.datosCorreo);
router.post('/facturas/:id/correo', facturaPropia.correo);
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

// Lo que ese cliente suele llevar, para recordárselo al tomarle el pedido.
// `:clienteId` es NUESTRO id del cliente (`cliente.id`), nunca el de Alegra.
router.get('/clientes/:clienteId/ciclos', facturaPropia.ciclos);
router.get('/clientes/:clienteId/sugerencias', facturaPropia.sugerencias);

module.exports = router;
