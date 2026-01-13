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

module.exports = router;
