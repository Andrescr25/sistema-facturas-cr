const router = require('express').Router();
const controlador = require('./seguimiento.controller');

// Permiso propio, `seguimiento-agentes`: solo lecturas de lo que hizo el agente.
router.get('/agentes', controlador.agentes);
router.get('/dia', controlador.dia);

module.exports = router;
