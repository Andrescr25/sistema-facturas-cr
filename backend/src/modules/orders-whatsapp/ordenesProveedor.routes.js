const router = require('express').Router();
const c = require('./ordenesProveedor.controller');
router.get('/estados', c.estados);
router.get('/ordenes', c.consultar);
router.post('/preparar', c.preparar);
router.post('/enviar', c.enviar);
module.exports = router;
