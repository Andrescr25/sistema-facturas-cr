const router = require('express').Router();
const s = require('./rutas.service');
// Montado bajo /clientes/rutas: las lecturas de Maps y todas las escrituras
// heredan el permiso Clientes, no el catálogo compartido de facturación.
const responder = (res, trabajo, status = 200) => trabajo.then(data => res.status(status).json({ success: true, data }))
  .catch(e => res.status(e.status || 500).json({ success: false, message: e.status ? e.message : 'No se pudo guardar o consultar la ruta.' }));
router.get('/', (req, res) => responder(res, s.listarRutas()));
router.post('/', (req, res) => responder(res, s.crearRuta(req.body, req.usuario?.id), 201));
router.get('/ciclos', (req, res) => responder(res, s.listarCiclos(req.query)));
router.get('/ciclos/:id', (req, res) => responder(res, s.obtenerCiclo(req.params.id)));
router.patch('/ciclos/:id/estado', (req, res) => responder(res, s.cambiarEstadoCiclo(req.params.id, req.body, req.usuario?.id)));
router.get('/:id', (req, res) => responder(res, s.obtenerRuta(req.params.id)));
router.put('/:id', (req, res) => responder(res, s.editarRuta(req.params.id, req.body, req.usuario?.id)));
router.put('/:id/orden', (req, res) => responder(res, s.reordenarRuta(req.params.id, req.body, req.usuario?.id)));
// Marcar de una vez qué clientes van en la ruta, sin abrir ficha por ficha.
router.get('/:id/asignacion', (req, res) => responder(res, s.candidatosDeRuta(req.params.id)));
router.put('/:id/clientes', (req, res) => responder(res, s.asignarClientes(req.params.id, req.body, req.usuario?.id)));
router.post('/:id/ciclos', (req, res) => responder(res, s.crearCiclo(req.params.id, req.body, req.usuario?.id), 201));
module.exports = router;
