const servicio = require('./preventa.service');

const responder = async (res, consultar) => {
  try {
    // No cachear una visita que puede cambiar al facturar o anular.
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: await consultar() });
  } catch (e) {
    res.status(e.status || 500).json({ success: false,
      message: e.status ? e.message : 'No se pudo consultar la agenda de Preventa.' });
  }
};

exports.rutas = (req, res) => responder(res, () => servicio.listarRutas());
exports.agenda = (req, res) => responder(res, () => servicio.agenda(req.query));
