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

module.exports = router;
