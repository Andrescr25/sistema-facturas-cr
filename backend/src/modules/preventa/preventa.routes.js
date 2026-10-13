const router = require('express').Router();
const controlador = require('./preventa.controller');

// Permiso propio en /api/preventa: no pide Clientes ni abre el portal.
router.get('/rutas', controlador.rutas);
router.get('/agenda', controlador.agenda);

module.exports = router;
