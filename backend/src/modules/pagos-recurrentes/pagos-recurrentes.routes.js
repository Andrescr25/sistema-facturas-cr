/**
 * Pagos Recurrentes - Routes (montadas en /api/pagos-recurrentes)
 */

const express = require('express');
const router = express.Router();
const controller = require('./pagos-recurrentes.controller');

// Segmentos fijos antes que los '/:id', o Express se los come.
router.get('/resumen', controller.obtenerResumen);
router.get('/fuentes', controller.listarFuentesAuto);
router.get('/fuentes/:fuente/opciones', controller.opcionesFuente);
router.post('/sincronizar', controller.sincronizarTodos);
router.get('/gastos', controller.listarGastos);
router.post('/gastos', controller.crearGasto);
router.get('/gastos/:id/historial', controller.historialGasto);
router.post('/gastos/:id/sincronizar', controller.sincronizarGasto);
router.put('/gastos/:id', controller.actualizarGasto);
router.patch('/gastos/:id/activo', controller.cambiarActivoGasto);
router.delete('/gastos/:id', controller.eliminarGasto);

router.get('/periodo/:periodo', controller.obtenerPeriodo);
router.patch('/pagos/:id', controller.actualizarPago);
router.post('/pagos/:id/pagar', controller.marcarPagado);
router.post('/pagos/:id/revertir', controller.revertirPago);

module.exports = router;
