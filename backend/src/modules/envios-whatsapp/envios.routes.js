const express = require('express');
const router = express.Router();
const controller = require('./envios.controller');

// Por el id de ALEGRA: solo lo usa todavía el aviso de pedidos del portal
// (sección 12 del checklist). Todo lo demás ya habla con ids propios.
router.get('/telefonos/:contactoId', controller.telefonosDelContacto);
// Por el id PROPIO del cliente. Son rutas distintas a propósito: los dos ids
// no son intercambiables y mezclarlos propone el teléfono de otra persona.
router.get('/telefonos-cliente/:clienteId', controller.telefonosDelCliente);
router.get('/historial', controller.historial);

module.exports = router;
