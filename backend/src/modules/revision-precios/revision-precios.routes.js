/**
 * Revision-Precios Module - Routes
 * Rutas para la revisión de precios (montadas en /api/revision-precios)
 */

const express = require('express');
const router = express.Router();
const revisionPreciosController = require('./revision-precios.controller');

// Facturas
router.get('/facturas', revisionPreciosController.getFacturas);
router.get('/facturas-relacionadas', revisionPreciosController.getFacturasRelacionadas);
router.post('/devolver-factura', revisionPreciosController.devolverFactura);

// Productos pendientes de relación
router.get('/productos-pendientes', revisionPreciosController.getProductosPendientes);
router.post('/confirmar-producto', revisionPreciosController.confirmarProducto);
router.post('/rechazar-producto', revisionPreciosController.rechazarProducto);
router.post('/actualizar-precio', revisionPreciosController.actualizarPrecio);

// Comparación de precios y envío a Alegra
router.post('/productos-batch', revisionPreciosController.getProductosBatch);
router.get('/facturas/:facturaId/sugerencias-precio', revisionPreciosController.getSugerenciasPrecio);
router.post('/enviar-alegra', revisionPreciosController.enviarAlegra);

// Estadísticas
router.get('/estadisticas', revisionPreciosController.getEstadisticas);

module.exports = router;
