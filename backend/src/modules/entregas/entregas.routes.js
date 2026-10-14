const router = require('express').Router();
const c = require('./entregas.controller');
// Todo el prefijo pertenece a Entregas. Corregir exige además administrador.
router.get('/rutas', c.rutas);
router.get('/ciclos', c.ciclos);
router.get('/exportar', c.exportar);
router.get('/plan', c.plan);
router.get('/paradas/:clave', c.parada);
router.get('/facturas/:id/registro', c.registro);
router.post('/facturas/:id/eventos', c.evento);
router.post('/facturas/:id/revision', c.revision);
module.exports = router;
