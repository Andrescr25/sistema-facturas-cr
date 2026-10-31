/**
 * «Mis ingresos» (2026-10-30): el empleado ve lo que va ganando y marca su
 * jornada. El id es SIEMPRE el de su sesión: nada que llegue de la pantalla
 * elige de quién se lee.
 */
const empleados = require('../empleados/empleados.service');
const jornadas = require('../empleados/jornada.service');

const responder = async (res, trabajo) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: await trabajo() });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, message: e.status ? e.message : 'No se pudieron consultar tus ingresos.' });
  }
};

exports.resumen = (req, res) => responder(res, () => empleados.ingresosDe(req.usuario?.id, req.query.periodo, { propio: true }));
exports.jornada = (req, res) => responder(res, () => jornadas.estadoDe(req.usuario?.id));
exports.iniciar = (req, res) => responder(res, () => jornadas.iniciar(req.usuario?.id, req.body?.ubicacion));
exports.terminar = (req, res) => responder(res, () => jornadas.terminar(req.usuario?.id, req.body?.ubicacion));
