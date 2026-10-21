/**
 * Warehouse Module - Routes
 * Rutas para operaciones de bodega/almacén
 */

const express = require('express');
const router = express.Router();
const warehouseController = require('./warehouse.controller');

// Facturas PROPIAS (sección 11 del checklist), por su id. Las de Alegra
// (`/facturas/:alegraId`) se retiraron el 2026-09-30.
router.get('/rutas', warehouseController.getRutas);
router.get('/facturas-propias', warehouseController.getFacturasPropias);
router.get('/facturas-propias/:facturaId/estados', warehouseController.getEstadosFacturaPropia);
router.post('/facturas-propias/:facturaId/faltantes', warehouseController.registrarFaltantesFacturaPropia);
router.post('/facturas-propias/:facturaId/estado', warehouseController.updateEstadoFacturaPropia);

module.exports = router;
