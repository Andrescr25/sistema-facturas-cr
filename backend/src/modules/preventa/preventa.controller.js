const servicio = require('./preventa.service');
const { puedeHacer } = require('../usuarios/permisos.middleware');
const { rutasDe } = require('../usuarios/rutasAsignadas');
const visitas = require('./visitas');
const { corregirFicha } = require('./fichaDesdeVisita');
const { crearClienteNuevo } = require('./clienteNuevo');
const plan = require('./planDelDia');

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
// «Próxima visita» (F4): el agente la marca solo en clientes de sus rutas.
exports.proximaVisita = (req, res) => responder(res, async () =>
  visitas.registrarProximaVisita(req.body || {}, { usuarioId: req.usuario?.id, rutasPermitidas: await rutasPermitidas(req) }));
// Rotación y ubicación exacta desde la visita (2026-10-29), solo en clientes de sus rutas.
exports.corregirFicha = (req, res) => responder(res, async () =>
  corregirFicha(req.params.id, req.body || {}, { usuarioId: req.usuario?.id, rutasPermitidas: await rutasPermitidas(req) }));
// «Cliente nuevo» (2026-10-30): queda a su nombre para el incentivo, en una de sus rutas.
exports.clienteNuevo = (req, res) => responder(res, async () =>
  crearClienteNuevo(req.body || {}, { usuarioId: req.usuario?.id, rutasPermitidas: await rutasPermitidas(req) }));
// «Mi día» (2026-11-01): el plan de visitas de hoy. Siempre el de su sesión.
exports.plan = (req, res) => responder(res, () => plan.planDe(req.usuario?.id));
exports.agregarAlPlan = (req, res) => responder(res, async () =>
  plan.agregar(req.usuario?.id, req.body?.clienteIds, { rutasPermitidas: await rutasPermitidas(req) }));
exports.quitarDelPlan = (req, res) => responder(res, () => plan.quitar(req.usuario?.id, req.params.clienteId));
exports.ordenarPlan = (req, res) => responder(res, () => plan.ordenar(req.usuario?.id, req.body?.clienteIds));
// «Guardar como orden de mi ruta» (parte 2): el orden de su día pasa a sus rutas.
exports.guardarOrdenDeRuta = (req, res) => responder(res, async () =>
  plan.guardarComoOrdenDeRuta(req.usuario?.id, { rutasPermitidas: await rutasPermitidas(req) }));
