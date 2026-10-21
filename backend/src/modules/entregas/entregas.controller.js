const servicio = require('./entregas.service');
const fisico = require('./registroFisico.service');
const { enviarExcel } = require('../../utils/exportarExcel');

const responder = async (res, consultar) => {
  try { res.set('Cache-Control', 'no-store'); res.json({ success: true, data: await consultar() }); }
  catch (e) { res.status(e.status || 500).json({ success: false, message: e.status ? e.message : 'No se pudo completar la operación de entregas.' }); }
};
exports.rutas = (req, res) => responder(res, () => servicio.listarRutas());
exports.plan = (req, res) => responder(res, () => servicio.plan(req.query));
exports.parada = (req, res) => responder(res, () => servicio.parada(req.params.clave, req.query));
exports.registro = (req, res) => responder(res, () => fisico.consultar(req.params.id));
exports.evento = (req, res) => responder(res, () => fisico.registrar(req.params.id, req.body, req.usuario?.id));
exports.revision = (req, res) => responder(res, () => fisico.revisar(req.params.id, req.body, req.usuario?.id));
exports.exportar = async (req, res) => {
  try { enviarExcel(res, await require('./entregas.excel').exportar(req.query)); }
  catch (e) { res.status(e.status || 500).json({ success: false, message: e.status ? e.message : 'No se pudo exportar el recorrido.' }); }
};
