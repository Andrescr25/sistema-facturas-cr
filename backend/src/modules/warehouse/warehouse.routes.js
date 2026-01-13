/**
 * Warehouse Module - Routes
 * Rutas para operaciones de bodega/almacén
 */

const express = require('express');
const router = express.Router();
const warehouseController = require('./warehouse.controller');

// GET /bodega/facturas - Obtener facturas para bodega
router.get('/facturas', warehouseController.getFacturas);

// POST /bodega/facturas/:alegraId/estado - Actualizar estado de factura
router.post('/facturas/:alegraId/estado', warehouseController.updateEstadoFactura);

module.exports = router;
