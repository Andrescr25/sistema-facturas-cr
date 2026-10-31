const router = require('express').Router();
const controlador = require('./empleados.controller');

// Permiso propio, `empleados`: la planilla de cada empleado y sus jornadas.
router.get('/', controlador.listar);
router.get('/usuarios', controlador.usuariosSinFicha);
router.post('/', controlador.crear);
router.patch('/jornadas/:id', controlador.corregirJornada);
// Anular un pago es solo de administrador (ACCIONES_ADMIN en usuarios/modulos.js).
router.patch('/pagos/:id/anular', controlador.anularPago);
router.get('/:usuarioId', controlador.detalle);
// Su día: recorrido, ventas, visitas y GPS (era «Seguimiento de agentes»).
router.get('/:usuarioId/dia', controlador.dia);
router.patch('/:usuarioId', controlador.actualizar);
router.post('/:usuarioId/jornadas', controlador.agregarJornada);
router.post('/:usuarioId/pagos/quincena', controlador.pagarQuincena);
router.post('/:usuarioId/pagos/gasolina', controlador.pagarGasolina);

module.exports = router;
