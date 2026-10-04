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
// `DELETE /proveedor/limpiar` se retiró el 2026-10-04. Borraba TODOS los
// faltantes (`DELETE FROM faltantes`, sin filtro), no tenía pantalla —el botón
// de Configuración llama a `/reportes/faltantes/proveedor/limpiar`, que borra
// solo lo ya procesado— y por `/alegra/faltantes` la alcanzaba cualquiera con
// sesión.

// Diagnóstico
router.get('/diagnostico/:alegraReference', missingItemsController.getDiagnostic);

// Asignación manual/reasignación de proveedores desde ReporteProveedores
router.post('/reasignar-proveedor', missingItemsController.assignSupplierManual);
router.post('/asignar-proveedor-manual', missingItemsController.assignSupplierManual);

module.exports = router;
