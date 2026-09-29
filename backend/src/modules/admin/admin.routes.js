/**
 * Admin Module - Routes
 * Rutas para operaciones administrativas y de debug
 */

const express = require('express');
const router = express.Router();
const adminController = require('./admin.controller');

// Debug endpoints
router.get('/test-simple', adminController.testSimple);
router.get('/database', adminController.databaseInfo);

// WhatsApp adentro del sistema: estado, vincular el teléfono y desvincularlo.
// Bajo /admin, así que es del módulo Configuración.
router.get('/whatsapp', adminController.estadoWhatsApp);
router.post('/whatsapp/vincular', adminController.vincularWhatsApp);
router.post('/whatsapp/desvincular', adminController.desvincularWhatsApp);

module.exports = router;
