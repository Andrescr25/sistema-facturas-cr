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
// Recordatorio de saldo por WhatsApp. El texto lo propone el servidor con
// los saldos de este momento; la pantalla lo deja editar antes de mandarlo.
router.get('/clientes/:clienteId/recordatorio', controller.propuestaRecordatorio);
router.post('/clientes/:clienteId/recordatorio', controller.enviarRecordatorio);

router.post('/abonos', controller.registrarAbono);
router.post('/sync', controller.sincronizar);

module.exports = router;
