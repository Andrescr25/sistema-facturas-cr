/**
 * Inventario-Auditorias Module - Routes
 * Rutas para auditorías de inventario (montadas en /api/inventario-auditorias)
 */

const express = require('express');
const router = express.Router();
const inventarioAuditoriasController = require('./inventario-auditorias.controller');

router.get('/', inventarioAuditoriasController.listarAuditorias);
router.get('/categorias', inventarioAuditoriasController.listarCategorias);
router.get('/buscar-productos', inventarioAuditoriasController.buscarProductosParaDevolucion);
router.post('/', inventarioAuditoriasController.crearAuditoria);
router.post('/devolucion', inventarioAuditoriasController.crearDevolucion);
router.get('/:id', inventarioAuditoriasController.getAuditoria);
router.put('/:id/items', inventarioAuditoriasController.guardarConteos);
router.post('/:id/items', inventarioAuditoriasController.agregarItemDevolucion);
router.delete('/:id/items/:itemId', inventarioAuditoriasController.eliminarItemDevolucion);
router.post('/:id/finalizar', inventarioAuditoriasController.finalizarAuditoria);
router.post('/:id/ajustar-alegra', inventarioAuditoriasController.ajustarEnAlegra);
router.post('/:id/resync', inventarioAuditoriasController.resincronizarAuditoria);

module.exports = router;
