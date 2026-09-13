/**
 * Cuentas por Cobrar - Routes
 * Montadas en /api/cuentas-por-cobrar (ver server.js)
 */

const express = require('express');
const router = express.Router();
const controller = require('./cuentas-por-cobrar.controller');
const cobros = require('./cobros.controller');

// ---- Sobre la base propia (sin Alegra) ----
// El prefijo `/propios` desaparece cuando la pantalla deje de usar el camino
// viejo; mientras tanto conviven, porque apagar el de Alegra antes dejaría a
// la empresa sin poder registrar un abono.
router.get('/propios/deudores', cobros.deudores);
router.get('/propios/facturas/:id/abonos', cobros.abonos);
router.post('/propios/abonos', cobros.registrar);
router.patch('/propios/abonos/:id/anular', cobros.anular);
// El cierre de caja: lo cobrado en el día y si el efectivo cuadra.
router.get('/propios/caja', cobros.resumenCaja);
router.post('/propios/caja/cerrar', cobros.cerrarCaja);
router.post('/propios/caja/reabrir', cobros.reabrirCaja);

// ---- Contra Alegra (lo de siempre) ----
router.get('/', controller.listar);
router.get('/cobros-dia', controller.cobrosDia);
router.get('/facturas/:alegraId/abonos', controller.getAbonos);
router.get('/facturas/:alegraId/productos', controller.getProductos);
// Recordatorio de saldo por WhatsApp. El texto lo propone el servidor con
// los saldos de este momento; la pantalla lo deja editar antes de mandarlo.
router.get('/clientes/:clienteId/recordatorio', controller.propuestaRecordatorio);
router.post('/clientes/:clienteId/recordatorio', controller.enviarRecordatorio);

router.post('/abonos', controller.registrarAbono);
router.post('/sync', controller.sincronizar);

module.exports = router;
