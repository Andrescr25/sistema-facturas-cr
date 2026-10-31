const router = require('express').Router();
const controlador = require('./empleados.controller');

// Permiso propio, `empleados`: la planilla de cada empleado y sus jornadas.
router.get('/', controlador.listar);
router.get('/usuarios', controlador.usuariosSinFicha);
router.post('/', controlador.crear);
router.patch('/jornadas/:id', controlador.corregirJornada);
router.get('/:usuarioId', controlador.detalle);
router.patch('/:usuarioId', controlador.actualizar);
router.post('/:usuarioId/jornadas', controlador.agregarJornada);

module.exports = router;
