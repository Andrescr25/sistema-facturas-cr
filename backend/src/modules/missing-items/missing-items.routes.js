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

// El borrado global se retiró. La antigua ruta de Reportes responde 410
// sin consultas; Configuración explica el archivo individual por recepción.

// `/diagnostico/:alegraReference` se retiró el 2026-10-04: nadie lo llamaba y
// buscaba el producto en la tabla vieja `productos`, que ya no se actualiza.

// Asignar un proveedor a un producto se hace por `POST /proveedores/asignaciones`
// (proveedores.asignacion.service.js), con ids propios. Lo que había acá le
// preguntaba el proveedor a Alegra en vivo.

module.exports = router;
