const router = require('express').Router();
const c = require('./ordenesProveedor.controller');
router.get('/estados', c.estados);
router.get('/contactos', c.contactos);
router.get('/ordenes', c.consultar);
router.post('/preparar', c.preparar);
router.post('/revisar-envio', c.revisarEnvio);
router.post('/enviar', c.enviar);
module.exports = router;
