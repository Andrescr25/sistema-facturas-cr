/**
 * Warehouse Module - Routes
 * Rutas para operaciones de bodega/almacén
 */

const express = require('express');
const router = express.Router();
const warehouseController = require('./warehouse.controller');

// Facturas PROPIAS (sección 11 del checklist, paso 1). La pantalla de la rama
// usa estas; las de abajo, por id de Alegra, quedan para lo que todavía llega
// por ahí. Van antes para que '/facturas/:alegraId' no se las trague.
router.get('/facturas-propias', warehouseController.getFacturasPropias);
router.get('/facturas-propias/:facturaId/estados', warehouseController.getEstadosFacturaPropia);
router.post('/facturas-propias/:facturaId/faltantes', warehouseController.registrarFaltantesFacturaPropia);
router.post('/facturas-propias/:facturaId/estado', warehouseController.updateEstadoFacturaPropia);

// GET /bodega/facturas - Obtener facturas para bodega
router.get('/facturas', warehouseController.getFacturas);
router.get('/facturas/:alegraId/estados', warehouseController.getEstadosFactura);

// POST /bodega/facturas/:alegraId/estado - Actualizar estado de factura
router.post('/facturas/:alegraId/estado', warehouseController.updateEstadoFactura);

module.exports = router;
