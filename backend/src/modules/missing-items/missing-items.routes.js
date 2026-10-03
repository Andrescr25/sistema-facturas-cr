/**
 * Missing-Items Module - Routes
 * Rutas para operaciones de faltantes
 */

const express = require('express');
const router = express.Router();
const missingItemsController = require('./missing-items.controller');

// Ajustes de faltantes
router.post('/ajustes', missingItemsController.saveAdjustment);
router.delete('/ajustes/:faltanteId', missingItemsController.deleteAdjustment);

// Limpieza
router.delete('/proveedor/limpiar', missingItemsController.cleanProviderMissingItems);

// Diagnóstico
router.get('/diagnostico/:alegraReference', missingItemsController.getDiagnostic);

// Asignar un proveedor a un producto se hace por `POST /proveedores/asignaciones`
// (proveedores.asignacion.service.js), con ids propios. Lo que había acá le
// preguntaba el proveedor a Alegra en vivo.

module.exports = router;
