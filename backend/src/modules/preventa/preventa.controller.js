const servicio = require('./preventa.service');
const { puedeHacer } = require('../usuarios/permisos.middleware');
const { rutasDe } = require('../usuarios/rutasAsignadas');

// Sin «Ver todas las rutas», solo las que se le asignaron en Usuarios (2026-10-29).
const rutasPermitidas = async (req) => ((await puedeHacer(req, 'rutas-todas')) ? null : rutasDe(req.usuario.id));

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

exports.rutas = (req, res) => responder(res, async () => servicio.listarRutas(await rutasPermitidas(req)));
exports.agenda = (req, res) => responder(res, async () => servicio.agenda(req.query, { rutasPermitidas: await rutasPermitidas(req) }));
