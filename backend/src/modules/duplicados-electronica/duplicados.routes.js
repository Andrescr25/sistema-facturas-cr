/**
 * Duplicados por conversión a electrónica - Routes
 */

const express = require('express');
const controller = require('./duplicados.controller');

const router = express.Router();

router.get('/pendientes', controller.pendientes);
router.get('/anulados', controller.anulados);
router.post('/revisar', controller.revisar);
router.post('/:duplicadoId/anular', controller.anular);

module.exports = router;
