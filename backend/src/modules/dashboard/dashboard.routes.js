/**
 * Dashboard - Routes
 */

const express = require('express');
const controller = require('./dashboard.controller');

const router = express.Router();
router.get('/resumen', controller.resumen);
router.get('/exportar', controller.exportar);

module.exports = router;
