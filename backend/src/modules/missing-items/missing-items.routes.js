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

// `DELETE /proveedor/limpiar` se retiró el 2026-10-04. Borraba TODOS los
// faltantes (`DELETE FROM faltantes`, sin filtro), no tenía pantalla —el botón
// de Configuración llama a `/reportes/faltantes/proveedor/limpiar`, que borra
// solo lo ya procesado— y por `/alegra/faltantes` la alcanzaba cualquiera con
// sesión.

// `/diagnostico/:alegraReference` se retiró el 2026-10-04: nadie lo llamaba y
// buscaba el producto en la tabla vieja `productos`, que ya no se actualiza.

// Asignar un proveedor a un producto se hace por `POST /proveedores/asignaciones`
// (proveedores.asignacion.service.js), con ids propios. Lo que había acá le
// preguntaba el proveedor a Alegra en vivo.

module.exports = router;
