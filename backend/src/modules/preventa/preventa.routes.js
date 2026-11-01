const router = require('express').Router();
const controlador = require('./preventa.controller');

// Permiso propio en /api/preventa: no pide Clientes ni abre el portal.
router.get('/rutas', controlador.rutas);
router.get('/agenda', controlador.agenda);
router.post('/visitas', controlador.proximaVisita);
router.patch('/clientes/:id', controlador.corregirFicha);
router.post('/clientes', controlador.clienteNuevo);
// «Mi día»: el plan de visitas de hoy del que está en sesión.
router.get('/plan', controlador.plan);
router.post('/plan/clientes', controlador.agregarAlPlan);
router.delete('/plan/clientes/:clienteId', controlador.quitarDelPlan);
router.put('/plan/orden', controlador.ordenarPlan);
router.post('/plan/orden-de-ruta', controlador.guardarOrdenDeRuta);

module.exports = router;
