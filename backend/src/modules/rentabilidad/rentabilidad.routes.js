/**
 * Rentabilidad Module - Routes (montado en /api/rentabilidad)
 *
 * Una sola pantalla: el resumen del negocio, la lista de productos y el
 * detalle de cada uno. La pestaña de Competencia y el monitoreo de márgenes
 * por fotos semanales se quitaron el 2026-09-25 (decisión del usuario).
 */

const express = require('express');
const router = express.Router();
const controller = require('./rentabilidad.controller');

router.get('/resumen', controller.obtenerResumen);
router.get('/productos', controller.listarProductos);
router.get('/exportar', controller.exportar);
router.get('/productos/:productoId/exportar', controller.exportarProducto);
router.get('/productos/:productoId', controller.obtenerProducto);

module.exports = router;
