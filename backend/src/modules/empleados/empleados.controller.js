const servicio = require('./empleados.service');
const jornadas = require('./jornada.service');

const responder = async (res, trabajo) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: await trabajo() });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, message: e.status ? e.message : 'No se pudo completar lo de Empleados.' });
  }
};

exports.listar = (req, res) => responder(res, () => servicio.listar());
exports.usuariosSinFicha = (req, res) => responder(res, () => servicio.usuariosSinFicha());
exports.crear = (req, res) => responder(res, () => servicio.crear(req.body || {}, req.usuario?.id));
exports.detalle = (req, res) => responder(res, () => servicio.ingresosDe(req.params.usuarioId, req.query.periodo));
exports.actualizar = (req, res) => responder(res, () => servicio.actualizar(req.params.usuarioId, req.body || {}, req.usuario?.id));
exports.agregarJornada = (req, res) => responder(res, () => jornadas.agregar(req.params.usuarioId, req.body || {}, req.usuario?.id));
exports.corregirJornada = (req, res) => responder(res, () => jornadas.corregir(req.params.id, req.body || {}, req.usuario?.id));
exports.pagarQuincena = (req, res) => responder(res, () => servicio.pagarQuincena(req.params.usuarioId, req.body || {}, req.usuario?.id));
exports.pagarGasolina = (req, res) => responder(res, () => servicio.pagarGasolina(req.params.usuarioId, req.body || {}, req.usuario?.id));
exports.anularPago = (req, res) => responder(res, () => servicio.anularPago(req.params.id, req.body || {}, req.usuario?.id));
exports.dia = (req, res) => responder(res, () => servicio.diaDe(req.params.usuarioId, req.query.fecha));
