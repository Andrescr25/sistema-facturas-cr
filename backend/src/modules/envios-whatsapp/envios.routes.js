const express = require('express');
const router = express.Router();
const controller = require('./envios.controller');

// Por el id PROPIO del cliente. Hubo otra ruta, `/telefonos/:contactoId`, que
// iba a buscar el teléfono a Alegra con el id de allá; se retiró el
// 2026-10-04, cuando el último que la usaba (el aviso de pedidos del portal)
// pasó a ids propios. Esta conserva su nombre para que nadie lea
// `/telefonos/:id` y mande el id que tenga a mano: los dos ids no son
// intercambiables y mezclarlos propone el teléfono de otra persona.
router.get('/telefonos-cliente/:clienteId', controller.telefonosDelCliente);
router.get('/historial', controller.historial);

module.exports = router;
