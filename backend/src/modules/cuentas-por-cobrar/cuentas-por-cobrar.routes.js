/**
 * Cuentas por Cobrar - Routes
 * Montadas en /api/cuentas-por-cobrar (ver server.js)
 */

const express = require('express');
const router = express.Router();
const controller = require('./cuentas-por-cobrar.controller');

router.get('/', controller.listar);
router.get('/cobros-dia', controller.cobrosDia);
router.get('/facturas/:alegraId/abonos', controller.getAbonos);
router.post('/abonos', controller.registrarAbono);
router.post('/sync', controller.sincronizar);

module.exports = router;
