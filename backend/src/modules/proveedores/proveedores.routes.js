/**
 * Proveedores Module - Routes
 * Rutas para proveedores (montadas en /api/proveedores)
 */

const express = require('express');
const router = express.Router();
const proveedoresController = require('./proveedores.controller');

router.get('/', proveedoresController.getProveedores);
router.get('/:cedula', proveedoresController.getFacturasPorCedula);

module.exports = router;
