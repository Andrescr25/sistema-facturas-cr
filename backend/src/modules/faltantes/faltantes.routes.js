/**
 * Faltantes Module - Routes
 * Rutas para el registro de faltantes (montadas en /api/faltantes, junto
 * con el módulo missing-items en ruteo híbrido — ver server.js)
 */

const express = require('express');
const router = express.Router();
const faltantesController = require('./faltantes.controller');

router.get('/', faltantesController.getFaltantes);
router.post('/', faltantesController.registrarFaltante);
router.post('/factura/:id/multiple', faltantesController.registrarFaltantesMultiples);
router.get('/factura/:id', faltantesController.getFaltantesPorFactura);
router.put('/:id', faltantesController.actualizarFaltante);
router.delete('/:id', faltantesController.eliminarFaltante);
router.get('/resumen/:ano/:mes/:semana', faltantesController.getResumenPorPeriodo);

module.exports = router;
