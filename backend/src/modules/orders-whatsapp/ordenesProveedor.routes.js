const router = require('express').Router();
const c = require('./ordenesProveedor.controller');
router.get('/estados', c.estados);
router.get('/ordenes', c.consultar);
router.post('/preparar', c.preparar);
module.exports = router;
