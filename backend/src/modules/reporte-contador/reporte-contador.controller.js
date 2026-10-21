const service = require('./reporte-contador.service');
const historico = require('./contador.historico');
const { vistaPublica, periodo } = require('./contador.mes');
const { uuidValido } = require('../../utils/validacion');
const { enviarExcel } = require('../../utils/exportarExcel');
const responder = (fn) => async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    await fn(req, res);
  } catch (e) {
    if (!e.status) console.error('Reporte Contador: no se pudo completar la operación.');
    res
      .status(e.status || 500)
      .json({ success: false, message: e.status ? e.message : 'No se pudo completar el reporte.' });
  }
};
const json = (fn) =>
  responder(async (req, res) => res.json({ success: true, data: await fn(req) }));
module.exports = {
  obtenerMes: json(async (req) => vistaPublica(await service.obtenerMes(req.query))),
  exportarMes: responder(async (req, res) =>
    enviarExcel(res, await service.exportarMes(req.query))
  ),
  comprobantes: responder(async (req, res) => {
    const a = await service.respaldosMes(req.query);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${a.nombre}"`);
    res.append('Access-Control-Expose-Headers', 'Content-Disposition');
    res.send(a.buffer);
  }),
  listarContactos: json(() => service.listarContactos()),
  crearContacto: json((req) => service.crearContacto(req.body || {})),
  eliminarContacto: json((req) => service.eliminarContacto(uuidValido(req.params.id))),
  enviarAlContador: json((req) => service.enviarAlContador(req.body || {})),
  listarPeriodos: json((req) => {
    const p = periodo(req.query);
    return historico.listarPeriodos(p.anio, p.mes);
  }),
  obtenerPeriodo: json((req) => historico.obtenerPeriodo(uuidValido(req.params.id))),
  exportarPeriodo: responder(async (req, res) => {
    const a = await historico.exportarPeriodo(uuidValido(req.params.id));
    enviarExcel(res, {
      buffer: a.buffer,
      nombre: `reporte-guardado-${uuidValido(req.params.id)}.xlsx`
    });
  })
};
