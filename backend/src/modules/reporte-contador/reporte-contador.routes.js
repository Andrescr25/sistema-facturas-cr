const router = require('express').Router();
const c = require('./reporte-contador.controller');
router.get('/mes', c.obtenerMes);
router.get('/mes/excel', c.exportarMes);
router.get('/mes/comprobantes', c.comprobantes);
router.get('/contactos', c.listarContactos);
router.post('/contactos', c.crearContacto);
router.delete('/contactos/:id', c.eliminarContacto);
router.post('/enviar-contador', c.enviarAlContador);
// Consulta de lo ya entregado, sin sobrescribirlo con las tablas actuales.
router.get('/periodos', c.listarPeriodos);
router.get('/periodos/:id', c.obtenerPeriodo);
router.get('/periodos/:id/exportar', c.exportarPeriodo);
module.exports = router;
