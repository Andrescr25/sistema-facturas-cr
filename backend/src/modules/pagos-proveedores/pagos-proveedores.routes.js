/**
 * Pagos-Proveedores Module - Routes
 * Rutas para cuentas por pagar a proveedores (montadas en /api/pagos-proveedores)
 */

const express = require('express');
const router = express.Router();
const pagosProveedoresController = require('./pagos-proveedores.controller');

router.get('/', pagosProveedoresController.listarCuentas);
router.patch('/:id', pagosProveedoresController.actualizarCuenta);

module.exports = router;
