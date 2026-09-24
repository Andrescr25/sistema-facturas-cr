const express = require('express');
const router = express.Router();
const controller = require('./cotizaciones.controller');

router.get('/', controller.listar);

// Va ANTES de '/:id': si no, Express lee "clientes" como el id de una
// cotización y la búsqueda termina en un 400 por id inválido.
router.get('/clientes', controller.buscarClientes);
router.get('/productos', controller.catalogo);

router.get('/:id', controller.detalle);
router.get('/:id/pdf', controller.pdf);

router.post('/', controller.crear);

// PUT y no PATCH: reemplaza las líneas enteras, así que la pantalla manda
// siempre todas —una cotización corregida puede tener menos que antes—.
router.put('/:id', controller.editar);

// Mandársela al cliente por WhatsApp, con el PDF adjunto.
router.post('/:id/whatsapp', controller.enviarPorWhatsApp);

// Borrar una que no se va a facturar. Una cotización no es documento fiscal.
router.delete('/:id', controller.eliminar);

// Convertir una cotización aceptada en factura de venta propia.
router.post('/:id/facturar', controller.facturar);

module.exports = router;
