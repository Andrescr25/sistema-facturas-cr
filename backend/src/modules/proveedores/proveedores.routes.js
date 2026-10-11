/**
 * Proveedores Module - Routes
 * Rutas para proveedores (montadas en /api/proveedores)
 *
 * Conviven dos cosas distintas:
 *
 * - `/fichas`: el maestro propio de la rama independencia-alegra (quién es el
 *   proveedor, su cédula, su WhatsApp, su plazo).
 * - `/` y `/:cedula`: el reporte de compras derivado de las facturas que
 *   entran por el buzón, que es lo que había antes.
 *
 * Las fichas van ANTES de `/:cedula`. Si fueran después, "fichas" se leería
 * como una cédula y la pantalla nueva recibiría el 404 del reporte viejo.
 */

const express = require('express');
const router = express.Router();
const proveedoresController = require('./proveedores.controller');
const maestro = require('./proveedores.maestro.controller');

router.get('/fichas', maestro.listar);
router.post('/fichas', maestro.crear);
router.get('/fichas/:id', maestro.obtener);
router.put('/fichas/:id', maestro.editar);
router.patch('/fichas/:id/estado', maestro.cambiarEstado);
// A quién se le pide un producto que faltó (Reporte de Proveedores). También
// antes de `/:cedula`.
router.post('/asignaciones', maestro.asignarProducto);

router.get('/', proveedoresController.getProveedores);
router.get('/:cedula', proveedoresController.getFacturasPorCedula);

module.exports = router;
