/**
 * Compras — Routes. Montadas en /api/compras (ver server.js).
 * El permiso es el mismo que Revisión de Precios (ver usuarios/modulos.js):
 * es la misma pantalla, con el botón renombrado.
 */

const express = require('express');
const router = express.Router();
const controlador = require('./compras.controller');

router.post('/registrar', controlador.registrar);
// La factura que llega en papel, sin XML (2026-10-25).
router.post('/manual', controlador.registrarManual);
router.get('/proveedores', controlador.proveedores);
// Una compra ya registrada, línea por línea, y corregir el producto de una (2026-11-05).
// Corregir es solo de administrador (ACCIONES_ADMIN en usuarios/modulos.js).
router.get('/por-factura/:facturaId', controlador.compraDeFactura);
router.put('/lineas/:id/producto', controlador.corregirProducto);

module.exports = router;
