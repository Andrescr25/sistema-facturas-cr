/**
 * Rutas del módulo de Reportes
 */

const express = require('express');
const ReportController = require('./report.controller');

const router = express.Router();
const reportController = new ReportController();

// Reporte de faltantes por proveedor
router.get('/faltantes/proveedor', reportController.getMissingItemsBySupplier);

// Las notas escritas al facturar, para leerlas al comprar
router.get('/faltantes/notas', reportController.getNotasDeFaltantes);

// Reporte de faltantes por cliente
router.get('/faltantes/cliente', reportController.getMissingItemsByClient);
// Por el id PROPIO de la factura (migración independencia/032).
router.post('/faltantes/cliente/facturas/:facturaId/impresion', reportController.enviarAImpresion);
router.post('/faltantes/cliente/facturas/:facturaId/recuperar', reportController.recuperarFactura);

// Limpiar faltantes procesados
router.delete('/faltantes/proveedor/limpiar', reportController.clearProcessedSupplierMissingItems);

// Encargos especiales, consolidado y compras sugeridas se retiraron el
// 2026-09-30 (rama independencia-alegra, migración 032): ninguna pantalla los
// llamaba y leían la tabla vieja de proveedores por `productos.proveedor_id`.

// Historial de procesamientos
router.get('/historial', reportController.getProcessingHistory);

module.exports = router;
