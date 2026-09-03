const express = require('express');
const router = express.Router();
const controller = require('./cotizaciones.controller');

router.get('/', controller.listar);

// Va ANTES de '/:id': si no, Express lee "clientes" como el id de una
// cotización y la búsqueda termina pidiéndole a Alegra /estimates/clientes.
router.get('/clientes', controller.buscarClientes);
router.get('/productos', controller.catalogo);

router.get('/:id', controller.detalle);
router.get('/:id/pdf', controller.pdf);

router.post('/', controller.crear);

// Alegra no acepta PATCH en cotizaciones (403): solo PUT, que reemplaza el
// documento entero. Por eso se mandan siempre todas las líneas.
router.put('/:id', controller.editar);

// Convertir una cotización aceptada en factura de venta.
router.post('/:id/facturar', controller.facturar);

module.exports = router;
