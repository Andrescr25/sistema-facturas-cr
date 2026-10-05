/**
 * Inventario-Auditorias Module - Routes
 * Rutas para auditorías de inventario (montadas en /api/inventario-auditorias)
 */

const express = require('express');
const router = express.Router();
const inventarioAuditoriasController = require('./inventario-auditorias.controller');

// OJO con el orden: todas las rutas de segmento fijo ('/descuentos',
// '/regalos', '/excesos'...) van ANTES que las '/:id', o Express hace que
// '/:id' se las coma tratando "descuentos" como un id.
router.get('/', inventarioAuditoriasController.listarAuditorias);
router.get('/categorias', inventarioAuditoriasController.listarCategorias);
router.get('/buscar-productos', inventarioAuditoriasController.buscarProductosParaDevolucion);
router.get('/regalos', inventarioAuditoriasController.listarRegalos);
router.get('/descuentos', inventarioAuditoriasController.listarDescuentosExceso);
// "Productos nuevos" del catálogo del agente. Antes de '/:id', que si no se
// traga '/productos-nuevos' como si fuera el id de una auditoría.
router.get('/productos-nuevos', inventarioAuditoriasController.listarProductosNuevos);
router.get('/productos-nuevos/buscar', inventarioAuditoriasController.buscarProductosNuevos);
router.post('/productos-nuevos', inventarioAuditoriasController.agregarProductoNuevo);
// Ruta distinta: un id histórico recibido por la app vieja nunca borra una
// entrada propia que casualmente tenga el mismo número.
router.delete('/productos-nuevos/registros/:registroId', inventarioAuditoriasController.quitarProductoNuevo);
router.post('/', inventarioAuditoriasController.crearAuditoria);
router.post('/devolucion', inventarioAuditoriasController.crearDevolucion);
router.post('/generar-excesos', inventarioAuditoriasController.generarExcesos);
router.post('/excesos', inventarioAuditoriasController.crearExcesoManual);
router.post('/descuentos', inventarioAuditoriasController.guardarDescuentoExceso);
router.delete('/descuentos/:productoId', inventarioAuditoriasController.eliminarDescuentoExceso);

router.get('/existencias', inventarioAuditoriasController.listarExistencias);
router.get('/kardex/:productoId', inventarioAuditoriasController.kardex);
router.put('/stock/:productoId', inventarioAuditoriasController.guardarUmbrales);

router.get('/:id', inventarioAuditoriasController.getAuditoria);
router.delete('/:id', inventarioAuditoriasController.eliminarAuditoria);
router.put('/:id/items', inventarioAuditoriasController.guardarConteos);
router.post('/:id/items', inventarioAuditoriasController.agregarItemDevolucion);
router.post('/:id/items-exceso', inventarioAuditoriasController.agregarItemExceso);
router.post('/:id/descuento', inventarioAuditoriasController.aplicarDescuentoTanda);
router.delete('/:id/items/:itemId', inventarioAuditoriasController.eliminarItemDevolucion);
router.patch('/:id/items/:itemId/exceso', inventarioAuditoriasController.actualizarItemExceso);
router.patch('/:id/items/:itemId/conteo', inventarioAuditoriasController.guardarConteoIndividual);
router.post('/:id/finalizar', inventarioAuditoriasController.finalizarAuditoria);
router.post('/:id/ajustar-inventario', inventarioAuditoriasController.ajustarInventario);
router.post('/:id/resync', inventarioAuditoriasController.resincronizarAuditoria);

module.exports = router;
