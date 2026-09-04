const express = require('express');
const router = express.Router();
const controller = require('./envios.controller');

// Los cuatro flujos (cotización, factura, saldo, pedido) piden los números
// por acá: es el mismo cliente de Alegra en todos los casos.
router.get('/telefonos/:contactoId', controller.telefonosDelContacto);
router.get('/historial', controller.historial);

module.exports = router;
