const s = require('./ordenesProveedor.service');
const responder = async (res, trabajo) => {
  try { res.set('Cache-Control', 'no-store'); res.json({ success: true, data: await trabajo() }); }
  catch (e) { res.status(e.status || 500).json({ success: false, message: e.status ? e.message : 'No se pudieron consultar o preparar las órdenes del proveedor.' }); }
};
exports.consultar = (req,res) => responder(res, () => s.consultar(req.query));
exports.preparar = (req,res) => responder(res, () => s.preparar(req.body, req.usuario?.id));
exports.estados = (req,res) => responder(res, () => s.estados());

exports.enviar = (req,res) => responder(res, () => require('./envioDesdeReporte.service').enviar(req.body, req.usuario?.id));
