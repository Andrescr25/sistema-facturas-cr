const servicio = require('./seguimiento.service');

const responder = async (res, consultar) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: await consultar() });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, message: e.status ? e.message : 'No se pudo consultar el seguimiento.' });
  }
};

exports.agentes = (req, res) => responder(res, () => servicio.agentes());
exports.dia = (req, res) => responder(res, () => servicio.dia(req.query));
