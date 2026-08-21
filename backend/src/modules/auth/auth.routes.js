/**
 * Auth - Routes
 *
 * /login y /estado son públicas (ver auth.middleware.js). El resto pasa por
 * requireAuth como cualquier otra ruta del sistema: crear usuarios exige
 * estar dentro, así nadie se da de alta solo desde internet.
 */

const express = require('express');
const controller = require('./auth.controller');

const router = express.Router();

router.post('/login', controller.login);
router.get('/estado', controller.estado);
router.get('/yo', controller.yo);
router.post('/usuarios', controller.crearUsuario);
router.post('/cambiar-password', controller.cambiarPassword);

module.exports = router;
