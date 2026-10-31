const router = require('express').Router();
const controlador = require('./ingresos.controller');

// Permiso propio, `ingresos`: cada uno ve y marca SOLO lo suyo.
router.get('/', controlador.resumen);
router.get('/jornada', controlador.jornada);
router.post('/jornada/iniciar', controlador.iniciar);
router.post('/jornada/terminar', controlador.terminar);

module.exports = router;
