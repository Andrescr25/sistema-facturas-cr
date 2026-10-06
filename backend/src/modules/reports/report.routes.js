/**
 * Rutas del módulo de Reportes
 */

const express = require('express');
const ReportController = require('./report.controller');

const router = express.Router();
const reportController = new ReportController();

// Reporte de faltantes por proveedor
router.get('/faltantes/proveedor/ciclos', reportController.getCiclos);
router.get('/faltantes/proveedor', reportController.getMissingItemsBySupplier);
router.get('/faltantes/proveedor/exportar', reportController.exportarProveedores);

// Las notas escritas al facturar, para leerlas al comprar
router.get('/faltantes/notas', reportController.getNotasDeFaltantes);

// Reporte de faltantes por cliente
router.get('/faltantes/cliente/ciclos', reportController.getCiclos);
router.get('/faltantes/cliente', reportController.getMissingItemsByClient);
router.get('/faltantes/cliente/exportar', reportController.exportarClientes);
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
