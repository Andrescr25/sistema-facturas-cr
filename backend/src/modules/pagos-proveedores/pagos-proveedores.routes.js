/**
 * Pagos-Proveedores Module - Routes
 * Rutas para cuentas por pagar a proveedores (montadas en /api/pagos-proveedores)
 */

const express = require('express');
const router = express.Router();
const pagosProveedoresController = require('./pagos-proveedores.controller');

// Segmentos fijos antes que '/:id', o Express se los come.
router.get('/', pagosProveedoresController.listarCuentas);
router.get('/proveedores', pagosProveedoresController.listarProveedoresConCuentas);
router.get('/notas-credito/huerfanas', pagosProveedoresController.listarNotasHuerfanas);
router.get('/notas-credito/saldos-a-favor', pagosProveedoresController.listarSaldosAFavor);
router.post('/notas-credito/aplicar', pagosProveedoresController.aplicarNotasCredito);
router.get('/notas-credito/:id/candidatas', pagosProveedoresController.listarCandidatas);
router.post('/notas-credito/:id/aplicar-a/:cuentaId', pagosProveedoresController.aplicarNotaACuenta);
router.delete('/notas-credito/:id', pagosProveedoresController.eliminarNotaCredito);
router.patch('/notas-credito/:id/inventario', pagosProveedoresController.marcarInventarioRevisado);
router.post('/pagos', pagosProveedoresController.registrarPago);
router.post('/pagos/:id/anular', pagosProveedoresController.anularPago);
router.patch('/:id', pagosProveedoresController.actualizarCuenta);

module.exports = router;
